import { execFile } from "node:child_process";
import type { BridgeStateResponse } from "./types.ts";
import { GIT_TIMEOUT_MS } from "./types.ts";

interface GitRunResult {
  stdout: string;
  code: number;
}

function runGit(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<GitRunResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        const code = error ? (typeof error.code === "number" ? error.code : -1) : 0;
        resolve({ stdout: String(stdout ?? ""), code });
      },
    );
  });
}

/**
 * 采集只读 Git 摘要。失败（非仓库、超时）不抛错，返回 error 字段。
 */
export async function collectGitStatus(cwd: string): Promise<BridgeStateResponse["git"]> {
  const fail = (error: string): BridgeStateResponse["git"] => ({
    branch: null, dirty: 0, untracked: 0, ahead: null, behind: null, updatedAt: Date.now(), error,
  });
  try {
    const { stdout, code } = await runGit(cwd, ["status", "--porcelain=v2", "--branch", "-z"]);
    if (code !== 0 || !stdout) return fail("git status 失败或非 git 仓库");
    const fields = stdout.split("\u0000");
    let branch: string | null = null;
    let ahead: number | null = null;
    let behind: number | null = null;
    let dirty = 0;
    let untracked = 0;
    for (const f of fields) {
      if (f.startsWith("# branch.head ")) {
        const ref = f.slice("# branch.head ".length).trim();
        branch = ref === "(detached)" ? null : ref || null;
      } else if (f.startsWith("# branch.ab ")) {
        const m = /\+(\d+) -(\d+)/.exec(f);
        if (m) { ahead = Number(m[1]); behind = Number(m[2]); }
      } else if (f.startsWith("1 ") || f.startsWith("2 ") || f.startsWith("u ")) {
        dirty++;
      } else if (f.startsWith("? ")) {
        untracked++;
      }
    }
    return { branch, dirty, untracked, ahead, behind, updatedAt: Date.now() };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
