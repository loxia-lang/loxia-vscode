#!/usr/bin/env node
"use strict";

// A tiny LSP server used by the integration smoke test. It answers the CLI probe
// (`--version`), initializes, and publishes one diagnostic when hello.lx opens.

if (process.argv.includes("--version")) {
  process.stdout.write("loxia 1.1.0\n");
  process.exit(0);
}

let buffer = Buffer.alloc(0);

function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function handle(message) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: {
          textDocumentSync: 1,
          hoverProvider: true,
          definitionProvider: true,
          completionProvider: { triggerCharacters: ["."] },
          documentSymbolProvider: true,
          renameProvider: { prepareProvider: true },
          inlayHintProvider: true,
          signatureHelpProvider: { triggerCharacters: ["(", ","] },
        },
      },
    });
    return;
  }
  if (message.method === "initialized") {
    return;
  }
  if (message.method === "shutdown") {
    send({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }
  if (message.method === "exit") {
    process.exit(0);
  }
  if (message.method === "textDocument/didOpen") {
    const uri = message.params.textDocument.uri;
    send({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri,
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            severity: 1,
            code: "E2001",
            source: "loxia",
            message: "fake diagnostic from the integration server",
          },
        ],
      },
    });
    return;
  }
  if (message.id !== undefined) {
    send({ jsonrpc: "2.0", id: message.id, result: null });
  }
}

function pump() {
  while (true) {
    const separator = buffer.indexOf("\r\n\r\n");
    if (separator < 0) {
      return;
    }
    const headers = buffer.subarray(0, separator).toString("ascii");
    const match = /Content-Length:\s*(\d+)/i.exec(headers);
    if (!match) {
      buffer = buffer.subarray(separator + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const start = separator + 4;
    if (buffer.length < start + length) {
      return;
    }
    const body = buffer.subarray(start, start + length);
    buffer = buffer.subarray(start + length);
    try {
      handle(JSON.parse(body.toString("utf8")));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
    }
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  pump();
});
