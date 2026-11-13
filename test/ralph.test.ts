import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectRalphLoops } from "../src/ralph.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ralph-test-"));
}

test("collectRalphLoops: 无 .ralph 目录 → available=false", () => {
  const dir = tmpDir();
  const r = collectRalphLoops(dir);
  assert.equal(r.available, false);
  assert.deepEqual(r.loops, []);
});

test("collectRalphLoops: 读取活动循环字段", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, ".ralph"));
  fs.writeFileSync(
    path.join(dir, ".ralph", "demo.state.json"),
    JSON.stringify({ name: "demo", status: "active", iteration: 3, maxIterations: 10 }),
  );
  const r = collectRalphLoops(dir);
  assert.equal(r.available, true);
  assert.deepEqual(r.loops, [{ name: "demo", status: "active", iteration: 3, maxIterations: 10 }]);
});

test("collectRalphLoops: 活动循环排在前面，非 state 文件与坏 JSON 跳过", () => {
  const dir = tmpDir();
  const ral = path.join(dir, ".ralph");
  fs.mkdirSync(ral);
  fs.writeFileSync(path.join(ral, "b-paused.state.json"), JSON.stringify({ name: "b", status: "paused", iteration: 1, maxIterations: 5 }));
  fs.writeFileSync(path.join(ral, "a-active.state.json"), JSON.stringify({ name: "a", status: "active", iteration: 2, maxIterations: 5 }));
  fs.writeFileSync(path.join(ral, "notes.txt"), "ignored");
  fs.writeFileSync(path.join(ral, "bad.state.json"), "{not json");
  const r = collectRalphLoops(dir);
  assert.deepEqual(r.loops.map((l) => l.name), ["a", "b"]);
});

test("collectRalphLoops: 缺字段时取默认值", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, ".ralph"));
  fs.writeFileSync(path.join(dir, ".ralph", "x.state.json"), JSON.stringify({ name: "x" }));
  const r = collectRalphLoops(dir);
  assert.deepEqual(r.loops, [{ name: "x", status: "paused", iteration: 0, maxIterations: 0 }]);
});

test("collectRalphLoops: completed 循环不进快照（历史噪声过滤）", () => {
  const dir = tmpDir();
  const ral = path.join(dir, ".ralph");
  fs.mkdirSync(ral);
  fs.writeFileSync(path.join(ral, "done.state.json"), JSON.stringify({ name: "done", status: "completed", iteration: 9, maxIterations: 9 }));
  fs.writeFileSync(path.join(ral, "live.state.json"), JSON.stringify({ name: "live", status: "active", iteration: 1, maxIterations: 5 }));
  const r = collectRalphLoops(dir);
  assert.deepEqual(r.loops, [{ name: "live", status: "active", iteration: 1, maxIterations: 5 }]);
});
