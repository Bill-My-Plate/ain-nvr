



export interface RtspRequestLine {
  readonly type: 'request';
  readonly method: string;
  readonly uri: string;
  readonly version: string;
}
