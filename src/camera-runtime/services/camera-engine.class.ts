import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { MessagePort } from 'node:worker_threads';
import { type CameraStatus } from '../../camera/index.js';
import { RtspStreamSession } from '../../stream-session/index.js';
import { CAMERA_RUNTIME_CONSTANTS } from '../constants/camera-runtime-numeric-values.constant.js';
import { CameraFrameController } from './camera-frame-controller.class.js';
import { CameraRecordingController } from './camera-recording-controller.class.js';
import { serializeError } from '../utils/serialize-error.util.js';
import { terminalCameraError } from '../utils/terminal-camera-error.util.js';
import type { Command } from '../types/command.type.js';
import type { RuntimeSettings } from '../types/runtime-settings.type.js';
import type { WorkerMessage } from '../types/worker-message.type.js';

/** Coordinates one worker-side RTSP session, its consumers, and camera status. */
export class CameraEngine {
  private readonly session: RtspStreamSession;
  private readonly abort = new AbortController();
  private readonly loopDelay = monitorEventLoopDelay({
    resolution: CAMERA_RUNTIME_CONSTANTS.eventLoopResolutionMs,
  });
  private readonly recording: CameraRecordingController;
  private readonly frames: CameraFrameController;
  private readonly timer: NodeJS.Timeout;
  private readonly unsubscribe: () => void;
  private generation = 0;
  private state: CameraStatus['state'] = 'starting';
  private statusPending = false;
  private closing: Promise<void> | undefined;

  /** Wires the camera session to its recording and frame controllers. */
  public constructor(
    private readonly cameraId: string,
    url: string,
    private readonly epoch: number,
    private readonly settings: RuntimeSettings,
    framePort: MessagePort,
    private readonly send: (message: WorkerMessage) => void,
  ) {
    this.session = new RtspStreamSession({ url });
    this.recording = new CameraRecordingController(
      this.session, cameraId, epoch, settings, send, () => this.publishStatus(),
    );
    this.frames = new CameraFrameController(
      this.session, cameraId, epoch, settings, framePort, this.abort.signal,
      () => this.generation, send, () => this.publishStatus(),
    );
    this.unsubscribe = this.session.subscribeSessionChanges((snapshot) => {
      this.generation = snapshot.generation;
      this.frames.onGeneration();
      this.publishStatus();
    });
    this.session.on('state', (state) => {
      if (this.abort.signal.aborted) return;
      this.state =
        state === 'streaming'
          ? 'streaming'
          : state === 'reconnecting'
            ? 'reconnecting'
            : 'starting';
      this.publishStatus();
    });
    this.session.on('reconnecting', (error) => {
      if (terminalCameraError(error)) {
        this.send({ kind: 'fatal', epoch, terminal: true, error: serializeError(error) });
        void this.close().catch(() => undefined);
      }
    });
    this.loopDelay.enable();
    this.timer = setInterval(() => {
      this.recording.publishProgress(this.statusPending);
      this.publishStatus();
    }, CAMERA_RUNTIME_CONSTANTS.statusPublishIntervalMs);
    this.timer.unref();
  }

  /** Starts RTSP negotiation within the configured acquire deadline. */
  public async start(): Promise<void> {
    await this.session.start(
      AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.settings.acquireTimeoutMs)]),
    );
  }

  /** Current RTSP generation used to reject stale decoder output. */
  public get streamGeneration(): number {
    return this.generation;
  }

  /** Releases a recording event slot after the host acknowledges it. */
  public acknowledgeEvent(sequence: number, failed: boolean): void {
    this.recording.acknowledgeEvent(sequence, failed);
  }

  /** Allows the next status snapshot after the host acknowledges this one. */
  public acknowledgeStatus(): void {
    this.statusPending = false;
  }

  /** Routes a worker command to the recording or frame owner. */
  public async execute(command: Command): Promise<void> {
    if (command.type === 'close') return this.close();
    this.abort.signal.throwIfAborted();
    if (command.type === 'record') {
      await this.recording.start(command.consumerId, command.options);
    } else if (command.type === 'frames') {
      await this.frames.start(command.consumerId, command.profile);
    } else if (command.type === 'boundary') {
      this.recording.boundary(command.consumerId);
    } else if (command.type === 'stop') {
      await this.recording.stop(command.consumerId);
      await this.frames.stop(command.consumerId);
    }
    this.publishStatus();
  }

  /** Stops consumers, then the session, and finally the frame message port. */
  public close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.abort.abort(new Error('Camera engine is closing.'));
    this.state = 'closing';
    this.unsubscribe();
    this.frames.beginClose();
    clearInterval(this.timer);
    this.loopDelay.disable();
    this.closing = (async () => {
      const results = await Promise.allSettled([
        this.recording.close(),
        this.frames.closeDecoder(),
      ]);
      await this.session.stop();
      this.recording.finishClose();
      this.state = 'closed';
      this.publishStatus();
      this.frames.closePort();
      const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (errors.length)
        throw new AggregateError(
          errors.map((result) => result.reason),
          'Camera shutdown could not finalize all consumers.',
        );
    })();
    return this.closing;
  }

  /** Publishes one bounded status snapshot until the host acknowledges it. */
  private publishStatus(): void {
    if (this.statusPending) return;
    this.statusPending = true;
    const delay = this.loopDelay.max / CAMERA_RUNTIME_CONSTANTS.nanosecondsPerMillisecond;
    this.loopDelay.reset();
    this.send({
      kind: 'status',
      epoch: this.epoch,
      status: {
        cameraId: this.cameraId,
        state: this.state,
        workerEpoch: this.epoch,
        streamGeneration: this.generation,
        recording: this.recording.active,
        decoder: this.frames.decoderState,
        framesDelivered: this.frames.framesDelivered,
        framesDropped: this.frames.framesDropped,
        recordingQueuedBytes: this.recording.queuedBytes,
        workerEventLoopDelayMs: Number.isFinite(delay) ? delay : 0,
        reconciliationNeeded: this.recording.reconciliationNeeded,
      },
    });
  }
}
