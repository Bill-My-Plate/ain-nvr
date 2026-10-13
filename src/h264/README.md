# H.264 module

H.264 video is carried as **Network Abstraction Layer (NAL) units**. A sequence
parameter set (SPS) gives stream-wide decoder parameters; a picture parameter
set (PPS) gives picture decoding parameters. An instantaneous decoding refresh
(IDR) picture can be decoded without earlier pictures; non-IDR pictures can
depend on them. This module inspects H.264 carried in the Real-time Transport
Protocol (RTP), discovers decoder settings from SPS/PPS, and assembles complete
pictures for downstream decoders. It does not parse RTP headers or decode
pictures into pixels.

## The three RTP payload forms

`inspectH264Payload` expects the bytes **after** the RTP header. It supports:

1. **Single NAL:** the payload is one complete NAL unit, starting with its
   one-byte NAL header. The inspection result contains that NAL.
2. **Single-Time Aggregation Packet type A (STAP-A):** one aggregation
   indicator, followed by repeated two-byte big-endian lengths and complete
   NAL units. The result contains each NAL in order. This lets one RTP packet
   carry, for example, SPS and PPS together.
3. **Fragmentation Unit type A (FU-A):** a fragmentation indicator, a
   fragmentation header, then part of one NAL's bytes. The result reports
   start/end flags, a reconstructed NAL header, and the fragment body. A
   single FU-A payload is **not** a complete NAL; the stateful services join
   fragments across ordered RTP packets.

Malformed payloads and other packetization forms cause `H264PayloadError`.
The three forms above describe **RTP packetization**, not the NAL types inside
the stream. `H264NalType` names NAL types such as SPS, PPS, IDR, STAP-A, and
FU-A.

The payload layouts are defined in the
[H.264 RTP payload format specification](https://www.rfc-editor.org/rfc/rfc6184.html).

## How the pieces work together

1. The RTP parser supplies a parsed packet. `inspectH264Payload` checks its
   H.264 payload and identifies one of the three forms above.
2. `H264ConfigurationTracker` learns SPS and PPS from complete NALs, including
   NALs recovered from FU-A. It reports a configuration when the SPS/PPS pair
   changes. `parseH264Sps` reads the SPS to obtain codec identity and cropped
   dimensions; it is not a full H.264 decoder.
3. `H264AccessUnitAssembler` groups ordered packets by RTP timestamp,
   reassembles fragmented NALs, and emits Annex-B access units. It prepends
   current SPS/PPS to IDR access units, drops damaged units, and waits for a
   decodable IDR after a break. A later timestamp or `flush()` completes the
   pending unit.

Annex-B is a byte stream in which each raw NAL is preceded by a start code
(`00 00 00 01` in assembler output). `splitH264NalUnits` accepts either a raw
NAL or Annex-B-delimited NALs and returns the NAL bytes without start codes.

## Public interface

The module entry point is [`index.ts`](index.ts). Consumers use the published
`ain-nvr/h264` path; other source modules import through this entry point.

### Payload and NAL helpers

- `inspectH264Payload(payload)` validates and describes one H.264 RTP payload.
  It returns `H264PayloadInspection`, including packetization, NAL types,
  complete NALs where available, and FU-A fragment details.
- `splitH264NalUnits(data)` splits raw or Annex-B data into raw NAL buffers.
- `normalizeH264ParameterSet(data, expectedType)` extracts an SPS (`7`) or PPS
  (`8`) NAL from raw or Annex-B data.
- `H264NalType` names the supported NAL header types;
  `H264PayloadError` reports invalid or unsupported RTP payloads.

### Configuration and SPS

- `parseH264Sps(nal)` accepts one raw SPS NAL, including its NAL header but no
  Annex-B start code. It returns profile, constraint flags, level, codec name,
  and dimensions after cropping as `H264SpsInfo`.
- `createH264CodecConfiguration(spsData, ppsData)` accepts raw or Annex-B NAL
  data, selects valid SPS/PPS units, and returns their normalized bytes,
  decoder settings, and a signature for detecting changes.
- `H264ConfigurationTracker` can be seeded with `seed(sps, pps)`. Call
  `push(payload, rtpTimestamp)` for each ordered H.264 RTP payload; it returns
  a `H264CodecConfiguration` only when a valid SPS/PPS pair changes.
  `resetFragments()` discards an incomplete FU-A assembly after packet loss.

### Access units

- `H264AccessUnitAssembler(options)` accepts an expected RTP payload type,
  clock rate, and optional initial parameter sets or playback start time.
  `push({ rtp, wallClockTimeMs, discontinuity?, lostBefore? })` consumes one
  ordered parsed RTP packet and returns any completed `H264AccessUnit` values.
  `flush()` completes the last pending unit; `reset()` clears in-flight state;
  `configuration` returns the latest valid decoder configuration.
- The caller must pass packets in order and report packet loss through
  `lostBefore` or a stream break through `discontinuity`. The assembler groups
  packets by RTP timestamp rather than the RTP marker bit.
- Each emitted `H264AccessUnit` contains Annex-B bytes, key/delta type,
  microsecond presentation time, RTP timestamp, wall-clock time, and recovery
  or configuration information where applicable.

The entry point also exports the related TypeScript contracts:
`H264Packetization`, `H264PayloadInspection`, `H264SpsInfo`,
`H264DecoderConfiguration`, `H264ParameterSets`, `H264CodecConfiguration`,
`H264AccessUnit`, and `H264AccessUnitAssemblerOptions`.

## Source map and invariant

- [types/](types/) contains public shapes and NAL/packetization names.
- [utils/](utils/) contains payload inspection, NAL splitting, SPS parsing,
  and configuration helpers.
- [services/](services/) contains the bit reader, configuration tracker, and
  access-unit assembler.
- [constants/](constants/) contains byte layouts and limits; [errors/](errors/)
  contains module errors.

Damaged units are dropped without corrupting the next access unit. The
package's published API is exposed through
[`src/exports/h264.ts`](../exports/h264.ts) and remains separate from this
module's internal entry point.
