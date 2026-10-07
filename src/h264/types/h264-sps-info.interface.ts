export interface H264SpsInfo {
  readonly profileIdc: number;
  readonly constraintFlags: number;
  readonly levelIdc: number;
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
}
