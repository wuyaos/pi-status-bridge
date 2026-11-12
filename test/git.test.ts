import assert from "node:assert/strict";
import { test } from "node:test";
import { collectGitStatus } from "../src/git.ts";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("本仓库内采集：有分支名与计数", async () => {
  const git = await collectGitStatus(process.cwd());
  assert.equal(git.error, undefined);
  assert.equal(typeof git.dirty, "number");
  assert.equal(typeof git.untracked, "number");
  // 本项目可能尚未 init git，允许 branch 为 null；但不允许抛错
});

test("非 git 目录返回 error 而不抛错", async () => {
  const dir = mkdtempSync(join(tmpdir(), "psb-nogit-"));
  try {
    const git = await collectGitStatus(dir);
    assert.ok(git.error);
    assert.equal(git.branch, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("真实仓库解析 branch/dirty/untracked/ahead", async () => {
  const dir = mkdtempSync(join(tmpdir(), "psb-git-"));
  const run = (args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  try {
    run(["init", "-q"]);
    run(["config", "user.email", "t@t"]);
    run(["config", "user.name", "t"]);
    writeFileSync(join(dir, "a.txt"), "a\n");
    run(["add", "."]);
    run(["commit", "-qm", "init"]);
    writeFileSync(join(dir, "b.txt"), "b\n"); // untracked
    writeFileSync(join(dir, "a.txt"), "a2\n"); // modified

    const expectedBranch = run(["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
    const git = await collectGitStatus(dir);
    assert.equal(git.error, undefined);
    assert.equal(git.branch, expectedBranch);
    assert.equal(git.dirty, 1);
    assert.equal(git.untracked, 1);
    assert.equal(git.ahead, null); // 无上游
  } finally {
    // Windows 上 git 对象文件句柄可能延迟释放，带重试清理
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
