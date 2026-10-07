export type LibavPacketLike = {
  readonly streamIndex: number;
  readonly flags: number;
  readonly size?: number;
  destroy(): void;
};
