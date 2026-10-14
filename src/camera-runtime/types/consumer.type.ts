import type { RecordingConsumer } from './recording-consumer.type.js';
import type { FrameConsumer } from './frame-consumer.type.js';
/**
 * Recording or frame consumer tracked by a camera owner.
 */
export type Consumer = RecordingConsumer | FrameConsumer;
