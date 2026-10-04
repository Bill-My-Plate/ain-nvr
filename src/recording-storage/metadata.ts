import type { FileHandle } from 'node:fs/promises';
import type { RtspSessionInfo } from '../stream/rtsp-stream-session.js';

export type ActiveRecordingSegment = {
  sessionStartMs: number;
  sessionMetadataPath: string;
  startMs: number;
  hourStartMs: number;
  partialMediaPath: string;
  mediaPath: string;
  metadataPath: string;
  handle: FileHandle;
  discontinuityBefore: boolean;
  clockAnchors: ClockAnchorMetadata[];
  playpoints: PlaypointMetadata[];
  keyframes: KeyframeMetadata[];
  bytes: number;
  endTimeMs: number;
};

export type PacketLocation = {
  segment: ActiveRecordingSegment;
  byteOffset: number;
};

export type RecordingSegmentWriterOptions = {
  cacheRoot: string;
  finalRoot?: string;
  cameraId: string;
  sessionStartMs: number;
  sessionInfo: RtspSessionInfo;
  segmentDurationMs: number;
  playpointIntervalMs?: number;
  minimumFreeBytes?: number;
  onCommitted: (segment: CommittedSegment) => void;
  onSessionClosed: (cameraId: string, sessionStartMs: number) => void;
  onConfigurationChanged?: () => void;
};

export type SegmentMetadata = {
  schemaVersion: 1;
  cameraId: string;
  sessionStartMs: number;
  segmentStartMs: number;
  endTimeMs: number;
  durationMs: number;
  complete: true;
  bytes: number;
  discontinuityBefore: boolean;
  clockAnchors: ClockAnchorMetadata[];
  playpointIntervalMs: number;
  playpoints: PlaypointMetadata[];
  keyframes: KeyframeMetadata[];
};

export type SessionMetadata = {
  schemaVersion: 1;
  cameraId: string;
  sessionStartMs: number;
  createdAt: string;
  segmentDurationMs: number;
  playpointIntervalMs: number;
  sdp: string;
  tracks: SessionTrack[];
};

export type CommittedSegment = {
  cameraId: string;
  sessionStartMs: number;
  hourStartMs: number;
  segmentStartMs: number;
  mediaPath: string;
  metadataPath: string;
  sessionMetadataPath: string;
};

export type ClockAnchorMetadata = {
  trackId: string;
  source: 'arrival' | 'rtcp-sr';
  timeMs: number;
  rtpTimestamp: number;
  byteOffset: number;
};

export type PlaypointMetadata = {
  timeMs: number;
  offsetMs: number;
  byteOffset: number;
};

export type KeyframeMetadata = PlaypointMetadata & {
  rtpTimestamp: number;
  sequenceNumber: number;
};

export type SessionTrack = {
  trackId: string;
  mediaType: 'video' | 'audio';
  codec: TrackCodec;
  clockRate: number;
  payloadType: number;
  control: string;
  rtpChannel: number;
  rtcpChannel: number;
  fmtp?: string;
  webCodec?: StoredWebCodecInfo;
  parameterSetsBase64?: StoredParameterSets;
};

export type TrackCodec = 'h264' | 'pcmu' | 'pcma';

export type StoredParameterSets = {
  sps: string;
  pps: string;
};

export type StoredWebCodecInfo = {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  bitstreamFormat: 'annexb';
};
