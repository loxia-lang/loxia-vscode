import assert from "node:assert/strict";
import test from "node:test";

import { MessageReader, encodeMessage, type JsonRpcMessage } from "../../src/protocol";

function frame(payload: object): Buffer {
  return encodeMessage(payload);
}

test("encodeMessage counts UTF-8 bytes, not characters", () => {
  const body = frame({ jsonrpc: "2.0", method: "test", params: { text: "olá 🌱" } });
  const header = body.subarray(0, body.indexOf("\r\n\r\n")).toString("ascii");
  const length = Number(/Content-Length: (\d+)/.exec(header)?.[1]);
  assert.equal(length, body.length - body.indexOf("\r\n\r\n") - 4);
});

test("MessageReader reads one message", () => {
  const messages: JsonRpcMessage[] = [];
  const reader = new MessageReader(
    (message) => messages.push(message),
    (error) => assert.fail(error.message),
  );
  reader.push(frame({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
  assert.deepEqual(messages, [{ jsonrpc: "2.0", id: 1, result: { ok: true } }]);
});

test("MessageReader reads multiple messages from one chunk", () => {
  const messages: JsonRpcMessage[] = [];
  const reader = new MessageReader(
    (message) => messages.push(message),
    (error) => assert.fail(error.message),
  );
  reader.push(Buffer.concat([frame({ id: 1 }), frame({ id: 2 }), frame({ id: 3 })]));
  assert.deepEqual(
    messages.map((message) => message.id),
    [1, 2, 3],
  );
});

test("MessageReader survives a message split across chunks", () => {
  const messages: JsonRpcMessage[] = [];
  const reader = new MessageReader(
    (message) => messages.push(message),
    (error) => assert.fail(error.message),
  );
  const body = frame({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: {} });
  for (let index = 0; index < body.length; index += 7) {
    reader.push(body.subarray(index, index + 7));
  }
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.method, "textDocument/publishDiagnostics");
});

test("MessageReader reports invalid JSON and keeps reading", () => {
  const messages: JsonRpcMessage[] = [];
  const errors: string[] = [];
  const reader = new MessageReader(
    (message) => messages.push(message),
    (error) => errors.push(error.message),
  );
  const invalid = Buffer.from("Content-Length: 3\r\n\r\nnot", "ascii");
  reader.push(Buffer.concat([invalid, frame({ id: 7 })]));
  assert.equal(errors.length, 1);
  assert.deepEqual(messages, [{ id: 7 }]);
});

test("MessageReader skips a frame without Content-Length", () => {
  const messages: JsonRpcMessage[] = [];
  const errors: string[] = [];
  const reader = new MessageReader(
    (message) => messages.push(message),
    (error) => errors.push(error.message),
  );
  reader.push(Buffer.from("Content-Type: application/json\r\n\r\n{}", "ascii"));
  reader.push(frame({ id: 9 }));
  assert.equal(errors.length, 1);
  assert.deepEqual(messages, [{ id: 9 }]);
});
