




import type { DecoderCandidate } from '../types/decoder-candidate.interface.js';
import type { DecoderHostCapabilities } from '../types/decoder-host-capabilities.interface.js';

export function decoderCandidates(
  capabilities: DecoderHostCapabilities,
): readonly DecoderCandidate[] {
  const candidates: DecoderCandidate[] = [];

  if (capabilities.platform === 'darwin' && capabilities.arch === 'arm64') {
    candidates.push({ label: 'videotoolbox', hardwareDevice: 'videotoolbox' });
  } else if (capabilities.platform === 'linux') {
    if (capabilities.renderDevices.length === 0) {
      candidates.push({ label: 'vaapi', hardwareDevice: 'vaapi' });
    } else {
      for (const deviceName of capabilities.renderDevices) {
        candidates.push({
          label: `vaapi:${deviceName}`,
          hardwareDevice: 'vaapi',
          deviceName,
        });
      }
    }
    if (capabilities.cudaAvailable) {
      candidates.push({ label: 'cuda', hardwareDevice: 'cuda' });
    }
    candidates.push({ label: 'vulkan', hardwareDevice: 'vulkan' });
  } else if (capabilities.platform === 'win32') {
    if (capabilities.intelCpu) {
      candidates.push({
        label: 'qsv',
        hardwareDevice: 'qsv',
        decoder: 'h264_qsv',
      });
    }
    candidates.push({ label: 'cuda', hardwareDevice: 'cuda' });
    candidates.push({ label: 'vulkan', hardwareDevice: 'vulkan' });
  }

  candidates.push({ label: 'software' });
  return candidates;
}
