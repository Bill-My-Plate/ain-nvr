import StreamSession = require('ain-nvr/stream-session');
import RecordingParser = require('ain-nvr/recording-parser');

const manager: StreamSession.RtspSessionManager = new StreamSession.RtspSessionManager();
const pipelineTypeCheck: typeof RecordingParser.RecordingPipeline = RecordingParser.RecordingPipeline;

void manager;
void pipelineTypeCheck;
