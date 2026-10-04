import { CameraOwner } from './camera-owner.js';
import { resolveSettings, StartupLimiter } from './settings.js';
import { cameraIdentity } from './validation.js';
import { failure, type RuntimeSettings } from './protocol.js';
import type { CameraLease, CameraRuntime, CameraRuntimeOptions, FrameHandle, FrameOptions, RecordingHandle, RecordingOptions } from './types.js';

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cancel = (): void => { signal.removeEventListener('abort', cancel); reject(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

class ManagedCameraRuntime implements CameraRuntime {
  private readonly owners = new Map<string, CameraOwner>();
  private readonly urls = new Map<string, CameraOwner>();
  private readonly limiter: StartupLimiter;
  private closing: Promise<void> | undefined;
  closed = false;
  finished = false;

  constructor(readonly settings: RuntimeSettings) { this.limiter = new StartupLimiter(settings.maxStartingCameras); }

  async acquire(input: { cameraId: string; url: string; signal?: AbortSignal }): Promise<CameraLease> {
    cameraIdentity(input.cameraId, input.url);
    input.signal?.throwIfAborted();
    if (this.closed) throw failure('ECLOSED', 'Camera runtime is closed.');
    let owner = this.owners.get(input.cameraId);
    if (owner?.closing !== undefined) {
      await abortable(owner.closing.catch(() => undefined), input.signal);
      return this.acquire(input);
    }
    if (owner !== undefined && owner.url !== input.url) throw failure('EINVAL', 'Camera ID is already registered with a different URL.');
    if (owner === undefined) {
      const existing = this.urls.get(input.url);
      if (existing !== undefined) throw failure('EEXIST', 'RTSP URL is already owned by another camera ID.');
      if (this.owners.size >= this.settings.maxCameras) throw failure('ENOSPC', 'Managed camera limit reached.');
      owner = new CameraOwner(input.cameraId, input.url, this.settings, this.limiter);
      this.owners.set(input.cameraId, owner);
      this.urls.set(input.url, owner);
    }
    if (owner.references >= this.settings.maxLeasesPerCamera) throw failure('ENOSPC', 'Camera lease limit reached.');
    owner.references++;
    try {
      await abortable(owner.ready(), input.signal);
      input.signal?.throwIfAborted();
      if (this.closed) throw failure('ECLOSED', 'Camera runtime is closed.');
      return new ManagedCameraLease(owner, () => this.drop(owner!), () => this.closed);
    } catch (error) {
      // One canceled waiter never aborts another waiter's startup.
      await this.drop(owner).catch(() => undefined);
      throw error;
    }
  }
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      const results = await Promise.allSettled([...this.owners.values()].map(owner => this.remove(owner)));
      this.finished = true;
      const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (errors.length) throw new AggregateError(errors.map(r => r.reason), 'Camera runtime shutdown was incomplete.');
    })();
    return this.closing;
  }
  private async drop(owner: CameraOwner): Promise<void> {
    owner.references--;
    if (owner.references === 0) await this.remove(owner);
  }
  private async remove(owner: CameraOwner): Promise<void> {
    try { await owner.close(); }
    finally {
      // close() confirms worker exit even when graceful finalization fails.
      if (this.owners.get(owner.cameraId) === owner) this.owners.delete(owner.cameraId);
      if (this.urls.get(owner.url) === owner) this.urls.delete(owner.url);
    }
  }
}

class ManagedCameraLease implements CameraLease {
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

const registryKey = Symbol.for('ain-nvr.camera-runtime');
const ABI = 'ain-nvr@0.1.8/camera-runtime:1';
interface Registry { abi: string; runtime: ManagedCameraRuntime }

/**
 * Shared by ESM/CommonJS imports in this JavaScript context. No work starts until acquire().
 * One worker owns each camera's RTSP session and schema-1 cache recording. Native JPEG
 * extraction runs in a package-owned child process fed by that worker's loopback bridge.
 * Other processes, go2rtc and direct low-level APIs are outside this registry.
 * Requires standard Node.js >=22. Bun and pkg executables are not supported by
 * this managed entrypoint; their worker/native-process lifecycle needs separate validation.
 */
export function getCameraRuntime(options: CameraRuntimeOptions = {}): CameraRuntime {
  const runtimeProcess = process as NodeJS.Process & { pkg?: unknown };
  if (process.versions.bun !== undefined || runtimeProcess.pkg !== undefined
    || Number(process.versions.node.split('.')[0]) < 22) {
    throw failure('unsupported_runtime', 'Managed camera workers require standard Node.js >=22. Bun and pkg executables are not supported.');
  }
  const scope = globalThis as typeof globalThis & { [registryKey]?: Registry };
  const existing = scope[registryKey];
  if (existing !== undefined) {
    if (existing.abi !== ABI) throw failure('EPROTO', 'Incompatible ain-nvr camera runtime is already loaded.');
    if (!existing.runtime.finished) {
      if (existing.runtime.closed) throw failure('ECLOSED', 'Wait for camera runtime close() before creating another runtime.');
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined && existing.runtime.settings[key as keyof RuntimeSettings] !== value) {
          throw failure('EINVAL', `Camera runtime is already configured with a different ${key}.`);
        }
      }
      return existing.runtime;
    }
  }
  const runtime = new ManagedCameraRuntime(resolveSettings(options));
  scope[registryKey] = { abi: ABI, runtime };
  return runtime;
}
