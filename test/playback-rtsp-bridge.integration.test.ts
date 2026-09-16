import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { PlaybackMessage } from '../src/playback/playback-stream.js';
import {
  createH264CodecConfiguration,
  splitH264NalUnits,
} from '../src/rtp/h264-configuration.js';
import { PlaybackRtspBridge } from '../src/stream/playback-rtsp-bridge.js';

const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
const mediaToolsAvailable =
  spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' }).status === 0
  && spawnSync(ffprobePath, ['-version'], { stdio: 'ignore' }).status === 0;

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
        reject(new Error(
          stderr.trim()
          || `${executable} failed with ${code ?? signal ?? 'unknown status'}.`,
        ));
      }
    });
  });
}

function toAnnexB(nalUnits: readonly Buffer[]): Buffer {
  return Buffer.concat(
    nalUnits.map((nal) => Buffer.concat([Buffer.from([0, 0, 0, 1]), nal])),
  );
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
    .filter((group) => group.some((nal) => {
      const nalType = (nal[0] ?? 0) & 0x1f;
      return nalType >= 1 && nalType <= 5;
    }))
    .map(toAnnexB);
}

function pcmSine(sampleRate: number, samples: number, offset: number): Buffer {
  const result = Buffer.allocUnsafe(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(
      Math.sin(((offset + index) * 2 * Math.PI * 440) / sampleRate) * 8_000,
    );
    result.writeInt16LE(value, index * 2);
  }
  return result;
}

test(
  'playback bridge exports generated H.264 and PCM to a probeable MP4',
  {
    skip: mediaToolsAvailable
      ? false
      : 'FFmpeg and ffprobe are unavailable.',
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
        '1',
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
      assert.equal(accessUnits.length, 10);
      const baseTimeMs = 10_000;

      async function* playback(): AsyncGenerator<PlaybackMessage> {
        yield {
          kind: 'ready',
          requestedTimeMs: baseTimeMs,
          actualStartTimeMs: baseTimeMs,
          configuration,
        };
        for (let tick = 0; tick < 50; tick += 1) {
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
        endTimeMs: baseTimeMs + 1_000,
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
      await bridgeRun;
      await exportProcess;

      assert.ok((await stat(outputPath)).size > 0);
      const probe = await runProcess(ffprobePath, [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name,codec_type',
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
      assert.ok(result.streams.some(
        (stream) => stream.codec_name === 'h264' && stream.codec_type === 'video',
      ));
      assert.ok(result.streams.some(
        (stream) => stream.codec_name === 'aac' && stream.codec_type === 'audio',
      ));
      assert.ok(Number(result.format.duration) > 0);
    } finally {
      await bridge?.stop();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  },
);
