import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";
import { createStore } from "../src/store.js";

test("backend API allows browser calls from the Vite app", async () => {
  const server = createServer(
    createApp({
      store: createStore([]),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { Origin: "http://localhost:5173" },
    });

    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("backend API handles CORS preflight", async () => {
  const server = createServer(
    createApp({
      store: createStore([]),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/poller/start`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
