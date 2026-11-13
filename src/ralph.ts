import * as fs from "node:fs";
import * as path from "node:path";
import type { RalphSummary } from "./types.ts";

/**
 * 只读采集 pi-ralph-wiggum 的循环状态。
 *
 * 权威源与 Ralph 扩展相同：<cwd>/.ralph/<name>.state.json（其 saveState 直接写这里，
 * archived 副本在其子目录，不采集）。纯文件读取，无子进程；坏文件跳过，不抛错。
 * 这里只取展示所需的最小字段，不解析任务文件、不猜测"当前"循环。
 */
export function collectRalphLoops(cwd: string): RalphSummary {
  const dir = path.join(cwd, ".ralph");
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return { available: false, loops: [] };
  }
  const loops: RalphSummary["loops"] = [];
  for (const file of entries) {
    if (!file.endsWith(".state.json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as Record<string, unknown>;
      if (typeof raw.name !== "string" || raw.name.length === 0) continue;
      // completed 为历史循环，不展示（避免噪声）；状态文件仍在，但不进快照。
      if (raw.status === "completed") continue;
      const status = raw.status === "active" || raw.status === "paused"
        ? raw.status
        : raw.active === true ? "active" : "paused";
      loops.push({
        name: raw.name,
        status,
        iteration: typeof raw.iteration === "number" ? raw.iteration : 0,
        maxIterations: typeof raw.maxIterations === "number" ? raw.maxIterations : 0,
      });
    } catch {
      // 坏文件/写入中的临时态：跳过该循环，不影响其他。
    }
  }
  loops.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "active" ? -1 : b.status === "active" ? 1 : 0));
  return { available: true, loops };
}
