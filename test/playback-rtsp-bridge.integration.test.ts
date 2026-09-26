import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPlaybackStream,
  type PlaybackMessage,
  type PlaybackSource,
} from '../src/playback/playback-stream.js';
import {
  createH264CodecConfiguration,
  splitH264NalUnits,
  type H264CodecConfiguration,
} from '../src/rtp/h264-configuration.js';
import { RtpPacketizer } from '../src/rtp/packetizer.js';
import { PlaybackRtspBridge } from '../src/stream/playback-rtsp-bridge.js';
import { interleaved, videoTrack } from './helpers/media.js';

const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
const mediaToolsAvailable =
  spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' }).status === 0 &&
  spawnSync(ffprobePath, ['-version'], { stdio: 'ignore' }).status === 0;

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

async function runProcess(
  executable: string,
  arguments_: readonly string[],
  timeoutMs = 15_000,
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(executable, arguments_, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out running ${executable}.`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(
            stderr.trim() || `${executable} failed with ${code ?? signal ?? 'unknown status'}.`,
          ),
        );
      }
    });
  });
}

function toAnnexB(nalUnits: readonly Buffer[]): Buffer {
  return Buffer.concat(nalUnits.map((nal) => Buffer.concat([Buffer.from([0, 0, 0, 1]), nal])));
}

function groupPictureAccessUnits(stream: Buffer): Buffer[] {
  const groups: Buffer[][] = [];
  let current: Buffer[] = [];
  for (const nal of splitH264NalUnits(stream)) {
    const nalType = (nal[0] ?? 0) & 0x1f;
    if (nalType === 9 && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(nal);
  }
  if (current.length > 0) groups.push(current);
  return groups
    .filter((group) =>
      group.some((nal) => {
        const nalType = (nal[0] ?? 0) & 0x1f;
        return nalType >= 1 && nalType <= 5;
      }),
    )
    .map(toAnnexB);
}

function pcmSine(sampleRate: number, samples: number, offset: number): Buffer {
  const result = Buffer.allocUnsafe(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin(((offset + index) * 2 * Math.PI * 440) / sampleRate) * 8_000);
    result.writeInt16LE(value, index * 2);
  }
  return result;
}

function recordedVideoSource(
  accessUnits: readonly Buffer[],
  configuration: H264CodecConfiguration,
  baseTimeMs: number,
  boundary: 'session' | 'gap',
): PlaybackSource<number> {
  const packetizer = new RtpPacketizer({
    payloadType: 96,
    clockRate: 90_000,
    initialTimestamp: 90_000,
  });
  const data = Buffer.concat(
    accessUnits.flatMap((unit, index) =>
      packetizer.packetizeH264(unit, index * 100_000).map((packet) => interleaved(0, packet)),
    ),
  );
  const segment = {
    ref: 0,
    sessionId: 'first',
    startTimeMs: baseTimeMs,
    endTimeMs: baseTimeMs + 3_000,
    discontinuityBefore: false,
    source: {
      id: 'recorded',
      safeLength: data.length,
      read: async (offset: number, length: number) => data.subarray(offset, offset + length),
    },
    tracks: [{ ...videoTrack, parameterSets: configuration }],
    clockAnchors: [{ trackId: 'video', byteOffset: 0, timeMs: baseTimeMs, rtpTimestamp: 90_000 }],
  };
  return {
    resolveStart: async () => ({ segment, byteOffset: 0, actualStartTimeMs: baseTimeMs }),
    nextSegment: async () => ({
      ...segment,
      ref: 1,
      sessionId: boundary === 'session' ? 'second' : 'first',
      startTimeMs: baseTimeMs + (boundary === 'gap' ? 10_000 : 3_000),
      endTimeMs: baseTimeMs + 13_000,
      source: {
        id: 'outside-span',
        safeLength: 4,
        read: async () => {
          throw new Error('Read beyond export span');
        },
      },
    }),
  };
}

for (const { audioOffsetMs, boundary } of [
  { audioOffsetMs: 0, boundary: 'session' },
  { audioOffsetMs: 2_000, boundary: 'gap' },
] as const) {
  test(
    'playback bridge preserves audio offset ' +
      audioOffsetMs +
      'ms and frames before a ' +
      boundary,
    {
      skip: mediaToolsAvailable ? false : 'FFmpeg and ffprobe are unavailable.',
      timeout: 20_000,
    },
    async () => {
      const temporaryDirectory = await mkdtemp(
        path.join(os.tmpdir(), 'ain-nvr-playback-rtsp-bridge-'),
      );
      const h264Path = path.join(temporaryDirectory, 'generated.h264');
      const outputPath = path.join(temporaryDirectory, 'export.mp4');
      let bridge: PlaybackRtspBridge | undefined;

      try {
        await runProcess(ffmpegPath, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=160x120:rate=10',
          '-t',
          '3',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-tune',
          'zerolatency',
          '-x264-params',
          'aud=1:keyint=10:min-keyint=10:scenecut=0',
          '-an',
          '-f',
          'h264',
          h264Path,
        ]);
        const h264 = await readFile(h264Path);
        const nalUnits = splitH264NalUnits(h264);
        const sps = nalUnits.find((nal) => ((nal[0] ?? 0) & 0x1f) === 7);
        const pps = nalUnits.find((nal) => ((nal[0] ?? 0) & 0x1f) === 8);
        if (sps === undefined || pps === undefined) {
          throw new Error('Generated H.264 stream omitted parameter sets.');
        }
        const configuration = createH264CodecConfiguration(sps, pps);
        const accessUnits = groupPictureAccessUnits(h264);
        assert.equal(accessUnits.length, 30);
        const baseTimeMs = 10_000;

        async function* playback(): AsyncGenerator<PlaybackMessage> {
          yield {
            kind: 'ready',
            requestedTimeMs: baseTimeMs,
            actualStartTimeMs: baseTimeMs,
            configuration,
          };
          for (let tick = 0; tick < 150; tick += 1) {
            const wallClockTimeMs = baseTimeMs + tick * 20;
            if (tick % 5 === 0) {
              const accessUnit = accessUnits[tick / 5];
              if (accessUnit !== undefined) {
                yield {
                  kind: 'video',
                  type: tick === 0 ? 'key' : 'delta',
                  data: accessUnit,
                  rtpTimestamp: tick * 1_800,
                  timestampUs: tick * 20_000,
                  wallClockTimeMs,
                  discontinuity: false,
                  ...(tick === 0 ? { configuration } : {}),
                };
              }
            }
            if (tick * 20 < audioOffsetMs) continue;
            yield {
              kind: 'audio',
              data: pcmSine(8_000, 160, tick * 160),
              timestampUs: tick * 20_000,
              wallClockTimeMs,
              durationUs: 20_000,
              sampleFormat: 's16le',
              sampleRate: 8_000,
              channels: 1,
            };
          }
          yield { kind: 'end', reason: 'end-of-recording' };
        }

        bridge = new PlaybackRtspBridge({
          playback: playback(),
          endTimeMs: baseTimeMs + 3_000,
          audioSampleRate: 8_000,
        });
        const timingStart = await bridge.start();
        const timingProbe = runProcess(ffprobePath, [
          '-v',
          'error',
          '-rtsp_transport',
          'tcp',
          '-show_packets',
          '-show_entries',
          'packet=codec_type,pts_time',
          '-of',
          'json',
          timingStart.url,
        ]);
        const [timing] = await Promise.all([timingProbe, bridge.run()]);
        const packets = (
          JSON.parse(timing.stdout) as {
            packets: Array<{ codec_type: string; pts_time?: string }>;
          }
        ).packets;
        const firstAudio = packets.find(
          (packet) => packet.codec_type === 'audio' && packet.pts_time !== undefined,
        );
        assert.ok(firstAudio);
        assert.equal(Number(firstAudio.pts_time), audioOffsetMs / 1_000);
        const videoPackets = packets.filter((packet) => packet.codec_type === 'video');
        assert.equal(videoPackets.length, 30);
        // FFmpeg may leave the first copied H.264 packet's PTS unset. All later
        // frames must still use the exact same NPT origin as the audio.
        for (const [index, packet] of videoPackets.entries()) {
          if (index === 0 && packet.pts_time === undefined) continue;
          assert.equal(Number(packet.pts_time), index / 10);
        }
        await bridge.stop();

        bridge = new PlaybackRtspBridge({
          playback: playback(),
          endTimeMs: baseTimeMs + 3_000,
          audioSampleRate: 8_000,
        });
        const started = await bridge.start();
        const exportProcess = runProcess(ffmpegPath, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-rtsp_transport',
          'tcp',
          '-i',
          started.url,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-ar',
          '8000',
          '-ac',
          '1',
          '-movflags',
          '+faststart',
          outputPath,
        ]);
        const bridgeRun = bridge.run();
        await Promise.all([bridgeRun, exportProcess]);

        assert.ok((await stat(outputPath)).size > 0);
        const probe = await runProcess(ffprobePath, [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_name,codec_type,start_time,nb_read_frames',
          '-count_frames',
          '-show_entries',
          'format=duration',
          '-of',
          'json',
          outputPath,
        ]);
        const result = JSON.parse(probe.stdout) as {
          readonly streams: ReadonlyArray<Record<string, string>>;
          readonly format: { readonly duration: string };
        };
        assert.ok(
          result.streams.some(
            (stream) => stream.codec_name === 'h264' && stream.codec_type === 'video',
          ),
        );
        assert.ok(
          result.streams.some(
            (stream) => stream.codec_name === 'aac' && stream.codec_type === 'audio',
          ),
        );
        assert.ok(Number(result.format.duration) > 0);
        const video = result.streams.find((stream) => stream.codec_type === 'video');
        const audio = result.streams.find((stream) => stream.codec_type === 'audio');
        assert.ok(video && audio);
        assert.equal(Number(video.nb_read_frames), 30);
        // Allow AAC priming (1024/8000 s) and one copied-video frame (1/10 s)
        // when FFmpeg estimates the missing initial H.264 timestamp during muxing.
        const offsetSeconds = Number(audio.start_time) - Number(video.start_time);
        assert.ok(
          Math.abs(offsetSeconds - audioOffsetMs / 1_000) < 0.24,
          'Expected audio offset ' +
            audioOffsetMs / 1_000 +
            's, got ' +
            offsetSeconds +
            's: ' +
            JSON.stringify(result),
        );
        await bridge.stop();

        // Exercise the real recorded-RTP parser through FFmpeg, with another
        // recording after the span. The old boundary path exported 29 frames.
        bridge = new PlaybackRtspBridge({
          playback: createPlaybackStream({
            source: recordedVideoSource(accessUnits, configuration, baseTimeMs, boundary),
            cameraId: 'camera',
            startTimeMs: baseTimeMs,
            maximumGapMs: 500,
          }),
          endTimeMs: baseTimeMs + 3_000,
        });
        const boundaryStart = await bridge.start();
        const boundaryOutput = path.join(temporaryDirectory, 'boundary.mp4');
        await Promise.all([
          runProcess(ffmpegPath, [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-rtsp_transport',
            'tcp',
            '-i',
            boundaryStart.url,
            '-map',
            '0:v:0',
            '-c:v',
            'copy',
            '-an',
            boundaryOutput,
          ]),
          bridge.run(),
        ]);
        const count = await runProcess(ffprobePath, [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-count_frames',
          '-show_entries',
          'stream=nb_read_frames',
          '-of',
          'csv=p=0',
          boundaryOutput,
        ]);
        assert.equal(Number(count.stdout.trim()), 30);
      } finally {
        await bridge?.stop();
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
  );
}
