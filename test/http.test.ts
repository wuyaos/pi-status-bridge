import assert from "node:assert/strict";
import { test } from "node:test";
import { BridgeServer } from "../src/http.ts";
import { BridgeState } from "../src/state.ts";
import { BRIDGE_HOST } from "../src/types.ts";

async function started() {
  const state = new BridgeState();
  const server = new BridgeServer(state);
  await server.start();
  state.reset({ piSessionId: "sess-1", cwd: process.cwd(), port: server.port });
  await state.refreshGit(true);
  state.applyOctsshEvent({ projectId: "p", aliases: [], generation: 1, at: 42 });
  return { state, server };
}

test("GET /state 返回完整只读快照", async () => {
  const { server } = await started();
  try {
    const res = await fetch(`http://${BRIDGE_HOST}:${server.port}/state`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.bridge.piSessionId, "sess-1");
    assert.equal(body.octssh.available, true);
    assert.deepEqual(body.octssh.aliases, []);
    assert.equal(typeof body.git.updatedAt, "number");
  } finally {
    await server.stop();
  }
});

test("GET /health 200；其他路径 404；POST 405", async () => {
  const { server } = await started();
  try {
    assert.equal((await fetch(`http://${BRIDGE_HOST}:${server.port}/health`)).status, 200);
    assert.equal((await fetch(`http://${BRIDGE_HOST}:${server.port}/nope`)).status, 404);
    const post = await fetch(`http://${BRIDGE_HOST}:${server.port}/state`, { method: "POST", body: "{}" });
    assert.equal(post.status, 405);
  } finally {
    await server.stop();
  }
});

test("端口冲突时自动顺延到下一个端口（注入独立端口段，不依赖环境）", async () => {
  const ports = [49701, 49702];
  const a = new BridgeServer(new BridgeState(), ports);
  const b = new BridgeServer(new BridgeState(), ports);
  try {
    await a.start();
    await b.start();
    assert.notEqual(a.port, b.port);
    assert.equal(ports.includes(a.port), true);
  } finally {
    await a.stop();
    await b.stop();
  }
});

test("stop 后端口释放且可重新绑定", async () => {
  const { server, state } = await started();
  const port = server.port;
  await server.stop();
  const again = new BridgeServer(state);
  await again.start();
  try {
    assert.equal(again.port, port);
  } finally {
    await again.stop();
  }
});
