import assert from "node:assert/strict";
import type { Socket } from "node:net";
import test from "node:test";

import { RtspHeaders, type RtspMessage } from "../src/rtsp-parser/index.js";
import { RtspRequestService } from "../src/rtsp-client/services/rtsp-request-service.class.js";

function response(cseq: number): RtspMessage {
  const headers = new RtspHeaders();
  headers.set("CSeq", String(cseq));
  return {
    type: "rtsp-message",
    startLine: {
      type: "response",
      version: "RTSP/1.0",
      statusCode: 200,
      statusMessage: "OK",
    },
    headers,
    body: Buffer.alloc(0),
    rawHeader: Buffer.alloc(0),
  };
}

test("request owner matches out-of-order CSeq responses and clears pending on disconnect", async () => {
  const written: string[] = [];
  const socket = {
    destroyed: false,
    write(chunk: Buffer, callback: (error?: Error) => void): boolean {
      written.push(chunk.toString("utf8"));
      callback();
      return true;
    },
  } as unknown as Socket;
  const requests = new RtspRequestService(() => socket, undefined, 5_000);
  const options = requests.request("OPTIONS", "rtsp://camera/stream");
  const describe = requests.request("DESCRIBE", "rtsp://camera/stream");

  assert.match(written[0] ?? "", /CSeq: 1\r\n/u);
  assert.match(written[1] ?? "", /CSeq: 2\r\n/u);
  assert.equal(requests.hasPendingRequests, true);
  requests.acceptResponse(response(2));
  assert.equal((await describe).headers.get("cseq"), "2");
  assert.equal(requests.hasPendingRequests, true);
  requests.acceptResponse(response(1));
  assert.equal((await options).headers.get("cseq"), "1");
  assert.equal(requests.hasPendingRequests, false);

  const abandoned = requests.request("PLAY", "rtsp://camera/stream");
  const disconnected = new Error("socket closed");
  requests.rejectPending(disconnected);
  await assert.rejects(abandoned, disconnected);
  assert.equal(requests.hasPendingRequests, false);
});
