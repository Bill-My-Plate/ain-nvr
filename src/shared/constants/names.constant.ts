import type { RobustnessMetricName } from '../types/robustness-metric-name.type.js';

export const NAMES: readonly RobustnessMetricName[] = [
  'normalizedSdpConfigurations',
  'inBandConfigurations',
  'reorderedPackets',
  'duplicatePackets',
  'lostPackets',
  'damagedAccessUnits',
  'discontinuities',
  'decoderReconfigurations',
  'decoderRecoveries',
];
