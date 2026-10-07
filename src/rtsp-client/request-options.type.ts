









export type RequestOptions = {
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Buffer;
  readonly allowAuthRetry?: boolean;
};
