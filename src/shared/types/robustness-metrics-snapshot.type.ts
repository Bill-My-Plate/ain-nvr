import type { RobustnessMetricName } from './robustness-metric-name.type.js';

export type RobustnessMetricsSnapshot = Readonly<Record<RobustnessMetricName, number>>;
