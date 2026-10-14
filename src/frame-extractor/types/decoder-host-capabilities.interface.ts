/**
 * Available operating-system and hardware decoder features.
 */
export interface DecoderHostCapabilities {
  /** Operating system reported by the decoder host. */
  readonly platform: NodeJS.Platform;
  /** CPU architecture reported by the decoder host. */
  readonly arch: string;
  /** Available hardware render devices. */
  readonly renderDevices: readonly string[];
  /** Whether CUDA decoding is available on this host. */
  readonly cudaAvailable: boolean;
  /** Whether the host has an Intel CPU. */
  readonly intelCpu: boolean;
}
