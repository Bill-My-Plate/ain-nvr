export type ClientErrorMessage = {
  readonly type: 'client_error';
  readonly generation: number;
  readonly code: 'unsupported_browser_codec';
};
