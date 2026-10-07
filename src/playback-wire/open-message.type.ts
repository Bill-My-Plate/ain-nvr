export type OpenMessage = {
  readonly type: 'open';
  readonly protocolVersion: 1;
  readonly cameraId: string;
  readonly startTimeMs: number;
  readonly includeAudio: boolean;
};
