import type { SdpDescription } from '../types/sdp-description.interface.js';
import type { MutableMedia } from '../types/mutable-media.type.js';
import { addAttribute } from './add-attribute.util.js';
import { parseAttribute } from './parse-attribute.util.js';
import { parsePayloadType } from './parse-payload-type.util.js';

export function parseSdp(raw: string): SdpDescription {
  const lines = raw.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines[0] !== 'v=0') {
    throw new Error('SDP must begin with v=0.');
  }

  const sessionAttributes = new Map<string, string[]>();
  const media: MutableMedia[] = [];
  let current: MutableMedia | undefined;
  let sessionControl: string | undefined;

  for (const line of lines) {
    if (line.length < 2 || line[1] !== '=') {
      throw new Error('Malformed SDP line.');
    }

    const kind = line[0];
    const value = line.slice(2);
    if (kind === 'm') {
      const fields = value.trim().split(/\s+/u);
      if (fields.length < 4) {
        throw new Error('Malformed SDP media description.');
      }
      const port = Number(fields[1]);
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error('Invalid SDP media port.');
      }
      current = {
        mediaType: fields[0] ?? '',
        port,
        protocol: fields[2] ?? '',
        payloadTypes: fields.slice(3).map((field) => parsePayloadType(field, 'm=')),
        rtpMaps: new Map(),
        fmtp: new Map(),
        attributes: new Map(),
      };
      media.push(current);
      continue;
    }

    if (kind !== 'a') {
      continue;
    }

    const [name, attributeValue] = parseAttribute(value);
    const target = current?.attributes ?? sessionAttributes;
    addAttribute(target, name, attributeValue);

    if (name === 'control') {
      if (current === undefined) {
        sessionControl = attributeValue;
      } else {
        current.control = attributeValue;
      }
      continue;
    }

    if (current === undefined) {
      continue;
    }

    if (name === 'rtpmap') {
      const match = /^(\d+)\s+([^/\s]+)\/(\d+)(?:\/(\d+))?$/u.exec(attributeValue);
      if (match === null) {
        throw new Error('Malformed SDP rtpmap attribute.');
      }
      const payloadType = parsePayloadType(match[1] ?? '', 'a=rtpmap');
      const clockRate = Number(match[3]);
      const channels = match[4] === undefined ? undefined : Number(match[4]);
      if (!Number.isInteger(clockRate) || clockRate <= 0
        || (channels !== undefined && (!Number.isInteger(channels) || channels <= 0))) {
        throw new Error('Invalid SDP rtpmap clock rate or channel count.');
      }
      current.rtpMaps.set(payloadType, {
        payloadType,
        encodingName: match[2] ?? '',
        clockRate,
        ...(channels === undefined ? {} : { channels }),
      });
      continue;
    }

    if (name === 'fmtp') {
      const match = /^(\d+)\s+(.+)$/u.exec(attributeValue);
      if (match === null) {
        throw new Error('Malformed SDP fmtp attribute.');
      }
      current.fmtp.set(
        parsePayloadType(match[1] ?? '', 'a=fmtp'),
        match[2] ?? '',
      );
    }
  }

  return {
    raw,
    ...(sessionControl === undefined ? {} : { sessionControl }),
    sessionAttributes,
    media,
  };
}
