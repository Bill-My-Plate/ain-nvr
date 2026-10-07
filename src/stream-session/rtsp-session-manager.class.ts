











import type { RtspSessionManagerOptions } from './rtsp-session-manager-options.interface.js';
import type { RtspSessionLease } from './rtsp-session-lease.interface.js';
import { RtspStreamSession } from './rtsp-stream-session.class.js';
import type { ManagedSession } from './managed-session.type.js';

export class RtspSessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private stopped = false;
  private stopPromise: Promise<void> | undefined;

  constructor(private readonly options: RtspSessionManagerOptions = {}) {}

  async acquire(input: { readonly url: string; readonly signal?: AbortSignal }): Promise<RtspSessionLease> {
    if (this.stopped) throw new Error('RTSP session manager stopped.');
    if (input.signal?.aborted) throw input.signal.reason;
    const key = input.url;
    let managed = this.sessions.get(key);
    if (managed === undefined) {
      const session = new RtspStreamSession({
        url: input.url,
        ...(this.options.logger === undefined ? {} : { logger: this.options.logger }),
        ...(this.options.reconnectInitialMs === undefined
          ? {}
          : { reconnectInitialMs: this.options.reconnectInitialMs }),
        ...(this.options.reconnectMaximumMs === undefined
          ? {}
          : { reconnectMaximumMs: this.options.reconnectMaximumMs }),
        ...(this.options.clientFactory === undefined
          ? {}
          : { clientFactory: this.options.clientFactory }),
      });
      managed = { session, leases: 0 };
      this.sessions.set(key, managed);
    }
    managed.leases += 1;
    try {
      // Each caller waits independently. Only the final reference stops the session.
      await managed.session.start(input.signal);
      if (input.signal?.aborted) throw input.signal.reason;
      if (this.stopped) throw new Error('RTSP session manager stopped.');
    } catch (error) {
      await this.release(key, managed);
      throw error;
    }
    let released = false;
    return {
      session: managed.session,
      release: async () => {
        if (released) return;
        released = true;
        await this.release(key, managed as ManagedSession);
      },
    };
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }

  async stop(): Promise<void> {
    if (this.stopPromise !== undefined) return this.stopPromise;
    this.stopped = true;
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    this.stopPromise = Promise.allSettled(sessions.map(async (managed) => managed.session.stop()))
      .then((results) => {
        const failures = results.filter((result) => result.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'RTSP shutdown failed.');
      });
    return this.stopPromise;
  }

  private async release(key: string, managed: ManagedSession): Promise<void> {
    managed.leases = Math.max(0, managed.leases - 1);
    if (managed.leases !== 0 || this.sessions.get(key) !== managed) return;
    this.sessions.delete(key);
    await managed.session.stop();
  }
}
