import assert from "node:assert/strict";
import { test } from "node:test";
import { BridgeState, wireOctsshEvents } from "../src/state.ts";

function fakeBus() {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    on(channel: string, handler: (data: unknown) => void) {
      const list = handlers.get(channel) ?? [];
      list.push(handler);
      handlers.set(channel, list);
      return () => {
        handlers.set(channel, (handlers.get(channel) ?? []).filter((h) => h !== handler));
      };
    },
    emit(channel: string, data: unknown) {
      for (const h of handlers.get(channel) ?? []) h(data);
    },
  };
}

test("reset 建立 bridge 基础状态且 octssh 不可用", () => {
  const s = new BridgeState();
  s.reset({ piSessionId: "abc", cwd: "D:/x", port: 47831 });
  s.refreshGit; // 引用存在
  // git 未采集时 snapshot 为 null（HTTP 层负责先采集）
  assert.equal(s.snapshot(), null);
});

test("applyOctsshEvent 记录别名并可清空", async () => {
  const s = new BridgeState();
  s.reset({ piSessionId: "abc", cwd: "D:/x", port: 47831 });
  await s.refreshGit(true); // 对非仓库或本仓库都能得到 git 快照
  s.applyOctsshEvent({ projectId: "p", aliases: ["laoda"], generation: 1, at: 123 });
  const snap = s.snapshot();
  assert.ok(snap);
  assert.equal(snap.octssh.available, true);
  assert.deepEqual(snap.octssh.aliases, ["laoda"]);
  s.clearOctssh();
  assert.equal(s.snapshot()?.octssh.available, false);
  assert.deepEqual(s.snapshot()?.octssh.aliases, []);
});

test("clear 清空全部状态", async () => {
  const s = new BridgeState();
  s.reset({ piSessionId: "abc", cwd: "D:/x", port: 47831 });
  await s.refreshGit(true);
  s.applyOctsshEvent({ projectId: "p", aliases: ["a"], generation: 1, at: 1 });
  s.clear();
  assert.equal(s.snapshot(), null);
});

test("wireOctsshEvents 订阅/退订与脏数据容错", async () => {
  const bus = fakeBus();
  const s = new BridgeState();
  s.reset({ piSessionId: "abc", cwd: "D:/x", port: 47831 });
  await s.refreshGit(true);
  const off = wireOctsshEvents(bus, s);
  bus.emit("octssh:approval-changed", null);
  bus.emit("octssh:approval-changed", { aliases: "not-array" });
  bus.emit("octssh:approval-changed", { aliases: ["a", 42, "b"], at: 9 });
  assert.deepEqual(s.snapshot()?.octssh.aliases, ["a", "b"]);
  assert.equal(s.snapshot()?.octssh.updatedAt, 9);
  off();
  bus.emit("octssh:approval-changed", { aliases: ["c"] });
  assert.deepEqual(s.snapshot()?.octssh.aliases, ["a", "b"]);
});

test("git 刷新节流：未过期时复用快照", async () => {
  const s = new BridgeState();
  s.reset({ piSessionId: "abc", cwd: process.cwd(), port: 47831 });
  await s.refreshGit(true);
  const first = s.snapshot()?.git.updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  await s.refreshGit(false); // 节流窗口内，不应重新采集
  assert.equal(s.snapshot()?.git.updatedAt, first);
});
