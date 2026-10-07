




export interface DecoderHostCapabilities {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly renderDevices: readonly string[];
  readonly cudaAvailable: boolean;
  readonly intelCpu: boolean;
}
