export interface SdpRtpMap {
  readonly payloadType: number;
  readonly encodingName: string;
  readonly clockRate: number;
  readonly channels?: number;
}
