









import { RtspClientError } from '../errors/rtsp-client-error.class.js';

export function parseSession(value: string | undefined): {
  sessionId: string;
  timeoutSeconds?: number;
} {
  if (!value) {
    throw new RtspClientError('SETUP response lacks a Session header.');
  }
  const [id, ...parameters] = value.split(';').map((field) => field.trim());
  if (!id) {
    throw new RtspClientError('SETUP response has an invalid Session header.');
  }
  let timeoutSeconds: number | undefined;
  for (const parameter of parameters) {
    const match = /^timeout=(\d+)$/iu.exec(parameter);
    if (match !== null) {
      timeoutSeconds = Number(match[1]);
    }
  }
  return { sessionId: id, ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }) };
}
