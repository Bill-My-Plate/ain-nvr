import StreamSession = require('ain-nvr/stream-session');
import RecordingParser = require('ain-nvr/recording-parser');
import CameraRuntime = require('ain-nvr/camera-runtime');

const manager: StreamSession.RtspSessionManager = new StreamSession.RtspSessionManager();
const pipelineTypeCheck: typeof RecordingParser.RecordingPipeline = RecordingParser.RecordingPipeline;

void manager;
void pipelineTypeCheck;
const cameraRuntimeTypeCheck: (options?: CameraRuntime.CameraRuntimeOptions) => CameraRuntime.CameraRuntime = CameraRuntime.getCameraRuntime;
void cameraRuntimeTypeCheck;
