# rtsp-parser

**Owns:** Bounded RTSP message, interleaved-frame, and SDP parsing.

**Internal entrypoint:** [`index.ts`](index.ts) exposes `RtspParser`, limits, errors, SDP selectors, and parsed shapes.

**Folders:** [types/](types/) (types, interfaces, and enums), [utils/](utils/) (single-purpose functions), [services/](services/) (stateful classes), [constants/](constants/) (named constants), [errors/](errors/) (error classes).

## `RtspParser` API

Import the class from `ain-nvr/rtsp-parser`. It reads a stream incrementally: each `push` can contain part of an item, one item, or several items.

### `new RtspParser(options?: RtspParserOptions)`

Creates a parser with an optional `mode` and byte limits. The mode is fixed for the lifetime of the instance:

- `'mixed'` (default) accepts RTSP messages and `$` interleaved frames in the same stream.
- `'message'` accepts only RTSP messages and rejects interleaved frames.
- `'interleaved'` accepts only `$` interleaved frames and rejects RTSP messages.

The optional limits are `maxHeaderBytes` (default 32 KiB), `maxBodyBytes` (default 1 MiB), and `maxInterleavedPacketBytes` (default 65,535 bytes). They bound an RTSP header, an RTSP body, and one interleaved payload, respectively. An invalid mode or an out-of-range limit throws `RangeError` during construction.

### `mode: RtspParserMode`

A readonly property containing the selected mode: `'mixed'`, `'message'`, or `'interleaved'`.

### `bufferedBytes: number`

A readonly getter for the number of input bytes still waiting to form a complete item. It is `0` when there is no incomplete input; it does not count items already returned by `push`.

### `push(chunk: Buffer): RtspStreamItem[]`

Adds bytes and returns every complete item available, in input order. It returns an empty array when more bytes are needed. `RtspStreamItem` is either an `RtspMessage` (`type: 'rtsp-message'`, with `startLine`, `headers`, `body`, and `rawHeader`) or an `RtspInterleavedFrame` (`type: 'interleaved-frame'`, with `channel`, `payload`, and `rawHeader`). Use `type` to distinguish them. Invalid input, input rejected by the selected mode, or an exceeded byte limit throws `RtspParseError`.

### `finish(): void`

Call when the input stream ends. It succeeds if no bytes remain buffered. If an item is incomplete, it throws `RtspParseError` with code `incomplete_input` and reports the buffered byte count. It does not return an item or clear the buffer.

### `reset(): void`

Discards all buffered bytes. Use it before parsing a new stream with the same mode and limits, or after abandoning incomplete input. It does not change `mode` or the configured limits.

### Example

```ts
import { RtspParser } from 'ain-nvr/rtsp-parser';

const parser = new RtspParser(); // Mixed mode.

for (const item of parser.push(Buffer.from('RTSP/1.0 200 OK\r\nCSeq: 1\r\n\r\n'))) {
  if (item.type === 'rtsp-message') {
    console.log(item.startLine, item.headers.get('CSeq'));
  } else {
    console.log(item.channel, item.payload);
  }
}

parser.finish();
```

Feed each received chunk to the same instance. Call `finish()` after the last chunk, or `reset()` if the stream is abandoned.

## Module boundaries

`RtspHeaders` stores names in lowercase and accepts any case for lookup and mutation. `RtspMessage.headers` is typed as `RtspHeaders`, which is exported from the module and package facade.

Cross-module imports use this module’s `index.ts`. The package’s published paths remain the facades in `src/exports/` and `src/index.ts`.

## Other module API

- **`ByteQueue`**: buffers partial TCP input and exposes bounded peek, read, and search operations.
- **`RtspParseError`**: reports invalid RTSP or interleaved input with a code.
- **`DEFAULT_RTSP_PARSER_LIMITS`**: default header, body, and interleaved payload limits.
- **`resolveRtspParserLimits`**: validates options and fills in those defaults.
- **`RtspParserLimits`**: resolved parser byte limits.
- **`tryReadRtspMessage`**: extracts one complete RTSP message from a byte queue when available.
- **`RtspRequestLine`** and **`RtspResponseLine`**: parsed request and response start-line shapes.
- **`RtspInterleavedFrame`**, **`RtspMessage`**, and **`RtspStreamItem`**: parsed output variants.
- **`RtspHeaders`**: case-insensitive RTSP header collection.
- **`RtspParserOptions`** and **`RtspParserMode`**: parser construction options and accepted input mode.
- **`parseSdp`**: parses an SDP session description used during RTSP setup.
- **`resolveRtspControlUrl`**: resolves media control URLs relative to the session URL.
- **`selectH264VideoMedia`** and **`selectG711AudioMedia`**: choose supported media from parsed SDP.
- **`SdpRtpMap`**, **`SdpMediaDescription`**, and **`SdpDescription`**: SDP codec mapping, media section, and session shapes.

See [how-it-works.md](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/rtsp-parser/how-it-works.md) and [review-map.md](/home/khaled/bmp/docs-chats/ain-nvr-refactoring/rtsp-parser/review-map.md) for the processing flow and file list.
