export type LibavFrameLike = {
  readonly width: number;
  readonly height: number;
  readonly hardwareDeviceType?: string;
  destroy(): void;
};
