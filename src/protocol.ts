const HEADER_SEPARATOR = "\r\n\r\n";
const CONTENT_LENGTH = /^Content-Length:\s*(\d+)\s*$/i;

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

/** JSON-RPC over stdio uses a byte-counted `Content-Length`, not a character count. */
export function encodeMessage(payload: object): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
  return Buffer.concat([header, body]);
}

/**
 * Incremental reader for the LSP framing. It tolerates headers other than
 * Content-Length, multiple messages per chunk and messages split across chunks.
 */
export class MessageReader {
  private buffer = Buffer.alloc(0);

  constructor(
    private readonly onMessage: (message: JsonRpcMessage) => void,
    private readonly onError: (error: Error) => void,
  ) {}

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const separator = this.buffer.indexOf(HEADER_SEPARATOR);
      if (separator < 0) {
        return;
      }
      const headerText = this.buffer.subarray(0, separator).toString("ascii");
      const length = this.contentLength(headerText);
      if (length === null) {
        // Without a length the body boundary is unknowable; drop the rest instead of
        // letting the leftover bytes corrupt the next frame.
        this.buffer = Buffer.alloc(0);
        this.onError(new Error("LSP frame without Content-Length"));
        return;
      }
      const start = separator + HEADER_SEPARATOR.length;
      if (this.buffer.length < start + length) {
        return;
      }
      const body = this.buffer.subarray(start, start + length);
      this.buffer = this.buffer.subarray(start + length);
      try {
        this.onMessage(JSON.parse(body.toString("utf8")) as JsonRpcMessage);
      } catch (error) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private contentLength(headerText: string): number | null {
    for (const line of headerText.split(/\r?\n/)) {
      const match = CONTENT_LENGTH.exec(line);
      if (match?.[1] !== undefined) {
        return Number.parseInt(match[1], 10);
      }
    }
    return null;
  }
}
