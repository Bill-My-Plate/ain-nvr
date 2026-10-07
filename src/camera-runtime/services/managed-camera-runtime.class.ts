import { CameraOwner } from './camera-owner.class.js';
import { StartupLimiter } from './startup-limiter.class.js';
import { cameraIdentity } from '../utils/camera-identity.util.js';
import { failure } from '../utils/failure.util.js';
import { type RuntimeSettings } from '../types/runtime-settings.type.js';
import type { CameraLease } from '../types/camera-lease.interface.js';
import type { CameraRuntime } from '../types/camera-runtime.interface.js';

import { abortable } from '../utils/abortable.util.js';
import { ManagedCameraLease } from './managed-camera-lease.class.js';

export class ManagedCameraRuntime implements CameraRuntime {
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
