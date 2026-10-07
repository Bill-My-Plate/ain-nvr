



export interface RtspResponseLine {
  readonly type: 'response';
  readonly version: string;
  readonly statusCode: number;
  readonly statusMessage: string;
}
