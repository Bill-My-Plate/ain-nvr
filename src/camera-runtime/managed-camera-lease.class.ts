import { CameraOwner } from './camera-owner.class.js';


import { failure } from './failure.util.js';
import type { CameraLease } from './camera-lease.interface.js';
import type { FrameHandle } from './frame-handle.interface.js';
import type { FrameOptions } from './frame-options.interface.js';
import type { RecordingHandle } from './recording-handle.interface.js';
import type { RecordingOptions } from './recording-options.interface.js';

export class ManagedCameraLease implements CameraLease {
  private released = false;
  private releasing: Promise<void> | undefined;
  private readonly owned = new Set<string>();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly subscriptions = new Set<() => void>();
  constructor(private readonly owner: CameraOwner, private readonly drop: () => Promise<void>, private readonly runtimeClosed: () => boolean) {}
  get cameraId(): string { return this.owner.cameraId; }
  get status() { return this.owner.status; }
  subscribeStatus(listener: Parameters<CameraLease['subscribeStatus']>[0]): () => void {
    this.assertActive();
    const unsubscribe = this.owner.subscribe(listener);
    const release = (): void => { unsubscribe(); this.subscriptions.delete(release); };
    this.subscriptions.add(release);
    return release;
  }
  startRecording(options: RecordingOptions): Promise<RecordingHandle> {
    this.assertActive();
    return this.track(this.owner.startRecording(options));
  }
  startFrames(options: FrameOptions): Promise<FrameHandle> {
    this.assertActive();
    return this.track(this.owner.startFrames({ ...options, onFrame: frame => {
      if (!this.released && !this.runtimeClosed()) return options.onFrame(frame);
    } }));
  }
  release(): Promise<void> {
    if (this.releasing !== undefined) return this.releasing;
    this.released = true;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.releasing = (async () => {
      await Promise.allSettled(this.pending);
      const results = await Promise.allSettled([...this.owned].map(id => this.owner.stop(id)));
      this.owned.clear();
      try { await this.drop(); }
      catch (error) { results.push({ status: 'rejected', reason: error }); }
      const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (errors.length) throw new AggregateError(errors.map(r => r.reason), 'Camera lease cleanup failed.');
    })();
    return this.releasing;
  }
  private track<T extends { completion: Promise<void> }>(operation: Promise<{ id: string; handle: T }>): Promise<T> {
    const result = operation.then(async ({ id, handle }) => {
      this.owned.add(id);
      void handle.completion.then(() => this.owned.delete(id), () => {
        // Failure may be reported before filesystem/decoder cleanup finishes.
        void this.owner.stop(id).finally(() => this.owned.delete(id)).catch(() => undefined);
      });
      if (this.released || this.runtimeClosed()) {
        await this.owner.stop(id);
        throw failure('ECLOSED', 'Camera lease was released during consumer startup.');
      }
      return handle;
    });
    this.pending.add(result);
    void result.then(() => this.pending.delete(result), () => this.pending.delete(result));
    return result;
  }
  private assertActive(): void {
    if (this.released || this.runtimeClosed()) throw failure('ECLOSED', 'Camera lease is released.');
  }
}
