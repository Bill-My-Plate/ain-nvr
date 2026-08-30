export interface SdpRtpMap {
  readonly payloadType: number;
  readonly encodingName: string;
  readonly clockRate: number;
  readonly channels?: number;
}

export interface SdpMediaDescription {
  readonly mediaType: string;
  readonly port: number;
  readonly protocol: string;
  readonly payloadTypes: readonly number[];
  readonly control?: string;
  readonly rtpMaps: ReadonlyMap<number, SdpRtpMap>;
  readonly fmtp: ReadonlyMap<number, string>;
  readonly attributes: ReadonlyMap<string, readonly string[]>;
}

export interface SdpDescription {
  readonly raw: string;
  readonly sessionControl?: string;
  readonly sessionAttributes: ReadonlyMap<string, readonly string[]>;
  readonly media: readonly SdpMediaDescription[];
}

interface MutableMedia {
  mediaType: string;
  port: number;
  protocol: string;
  payloadTypes: number[];
  control?: string;
  rtpMaps: Map<number, SdpRtpMap>;
  fmtp: Map<number, string>;
  attributes: Map<string, string[]>;
}

function addAttribute(
  attributes: Map<string, string[]>,
  name: string,
  value: string,
): void {
  const values = attributes.get(name);
  if (values === undefined) {
    attributes.set(name, [value]);
  } else {
    values.push(value);
  }
}

function parseAttribute(line: string): readonly [string, string] {
  const separator = line.indexOf(':');
  return separator < 0
    ? [line.trim().toLowerCase(), '']
    : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
}

function parsePayloadType(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 127) {
    throw new Error(`Invalid SDP payload type in ${field}.`);
  }
  return parsed;
}

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

function asDirectoryUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export function resolveRtspControlUrl(
  describeUrl: string,
  mediaControl: string,
  sessionControl?: string,
  contentBase?: string,
): string {
  const base = contentBase ?? describeUrl;
  const sessionBase = !sessionControl || sessionControl === '*'
    ? base
    : new URL(sessionControl, asDirectoryUrl(base)).toString();

  if (mediaControl === '*') {
    return sessionBase;
  }
  return new URL(mediaControl, asDirectoryUrl(sessionBase)).toString();
}

export function selectH264VideoMedia(
  description: SdpDescription,
): { media: SdpMediaDescription; rtpMap: SdpRtpMap } | undefined {
  for (const media of description.media) {
    if (media.mediaType.toLowerCase() !== 'video') {
      continue;
    }
    for (const payloadType of media.payloadTypes) {
      const rtpMap = media.rtpMaps.get(payloadType);
      if (rtpMap?.encodingName.toLowerCase() === 'h264') {
        return { media, rtpMap };
      }
    }
  }
  return undefined;
}

export function selectG711AudioMedia(
  description: SdpDescription,
): { media: SdpMediaDescription; rtpMap: SdpRtpMap; codec: 'pcmu' | 'pcma' } | undefined {
  for (const media of description.media) {
    if (media.mediaType.toLowerCase() !== 'audio') continue;
    for (const payloadType of media.payloadTypes) {
      const mapped = media.rtpMaps.get(payloadType);
      const encoding = mapped?.encodingName.toLowerCase()
        ?? (payloadType === 0 ? 'pcmu' : payloadType === 8 ? 'pcma' : '');
      if (encoding !== 'pcmu' && encoding !== 'pcma') continue;
      return {
        media,
        rtpMap: mapped ?? {
          payloadType,
          encodingName: encoding.toUpperCase(),
          clockRate: 8_000,
          channels: 1,
        },
        codec: encoding,
      };
    }
  }
  return undefined;
}
