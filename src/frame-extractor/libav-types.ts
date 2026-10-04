export interface LibavStreamLike {
  readonly index: number;
  readonly codec: string;
  readonly type: string;
  readonly width: number;
  readonly height: number;
}

export interface LibavPacketLike {
  readonly streamIndex: number;
  readonly flags: number;
  readonly size?: number;
  destroy(): void;
}

export interface LibavFrameLike {
  readonly width: number;
  readonly height: number;
  readonly hardwareDeviceType?: string;
  destroy(): void;
}

export interface LibavDecoderLike {
  readonly vendorInfo?: Record<string, unknown>;
  sendPacket(packet: LibavPacketLike): Promise<boolean>;
  receiveFrame(): Promise<LibavFrameLike | null | undefined>;
  destroy(): void;
}

export interface LibavReceivedPacket extends LibavPacketLike {
  readonly type: 'packet';
}

export interface LibavReceivedFrame extends LibavFrameLike {
  readonly type: 'frame';
  readonly streamIndex: number;
}

export interface LibavFormatContextLike {
  readonly streams: readonly LibavStreamLike[];
  open(input: string, options?: Record<string, string>): Promise<void>;
  createDecoder(
    streamIndex: number,
    hardwareDevice?: string,
    decoder?: string,
    deviceName?: string,
  ): LibavDecoderLike;
  readFrame(): Promise<LibavPacketLike | null | undefined>;
  receiveFrame(pipelines: readonly [{
    readonly streamIndex: number;
    readonly decoder: LibavDecoderLike;
  }]): Promise<LibavReceivedFrame | LibavReceivedPacket | null | undefined>;
  close(): Promise<void>;
}

export interface LibavRuntime {
  readonly keyPacketFlag: number;
  initialize(): Promise<void>;
  createFormatContext(): LibavFormatContextLike;
  toJpeg(frame: LibavFrameLike, quality: number): Promise<Buffer>;
}
