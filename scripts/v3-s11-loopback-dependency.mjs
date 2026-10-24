#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import http from "node:http";

const readyFile = process.env.V3_S11_DEPENDENCY_READY_FILE?.trim();
if (!readyFile) {
  console.error("V3_S11_DEPENDENCY_READY_FILE is required");
  process.exit(64);
}

const rawPort = process.env.V3_S11_DEPENDENCY_PORT?.trim() || "0";
if (!/^\d+$/.test(rawPort)) {
  console.error("V3_S11_DEPENDENCY_PORT must be an integer between 0 and 65535");
  process.exit(64);
}
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("V3_S11_DEPENDENCY_PORT must be an integer between 0 and 65535");
  process.exit(64);
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(204, {
      "cache-control": "no-store",
      connection: "close",
    });
    response.end();
    return;
  }

  response.writeHead(404, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    connection: "close",
  });
  response.end("not found\n");
});

server.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("loopback dependency did not expose a TCP address");
    process.exit(1);
  }

  writeFileSync(
    readyFile,
    `${JSON.stringify(
      {
        host: "127.0.0.1",
        port: address.port,
        url: `http://127.0.0.1:${address.port}/health`,
        pid: process.pid,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});

let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2_000).unref();
}

process.on("SIGTERM", close);
process.on("SIGINT", close);
