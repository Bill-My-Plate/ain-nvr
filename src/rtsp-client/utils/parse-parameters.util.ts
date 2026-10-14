import { RTSP_CLIENT_CONSTANTS } from '../constants/rtsp-client-numeric-values.constant.js';
/** Read case-insensitive authentication parameters and unescape quoted values. */
export function parseParameters(value: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"((?:\\.|[^"])*)"|([^,\s]+))/gu;
  for (const match of value.matchAll(pattern)) {
    const name = (match[1] ?? '').toLowerCase();
    const raw =
      match[RTSP_CLIENT_CONSTANTS.quotedParameterCaptureGroup] ??
      match[RTSP_CLIENT_CONSTANTS.unquotedParameterCaptureGroup] ??
      '';
    result.set(name, raw.replace(/\\([\\"])/gu, '$1'));
  }
  return result;
}
