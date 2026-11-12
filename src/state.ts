import type { BridgeStateResponse, OctsshApprovalEvent } from "./types.ts";
import { OCTSSH_EVENT_CHANNEL } from "./types.ts";
import { collectGitStatus } from "./git.ts";
import { GIT_REFRESH_THROTTLE_MS } from "./types.ts";

/**
 * 每个存活 Pi 进程一份的桥接状态。
 * session_start 时 reset()，session_shutdown 时全部清空。
 */
export class BridgeState {
  private piSessionId = "";
  private cwd = "";
  private port = 0;
  private startedAt = 0;

  private octsshAvailable = false;
  private octsshAliases: string[] = [];
  private octsshUpdatedAt = 0;

  private git: BridgeStateResponse["git"] | null = null;
  private gitPending: Promise<void> | null = null;
  private lastGitRefreshAt = 0;

  reset(info: { piSessionId: string; cwd: string; port: number }): void {
    this.piSessionId = info.piSessionId;
    this.cwd = info.cwd;
    this.port = info.port;
    this.startedAt = Date.now();
    this.clearOctssh();
  }

  /** 端口绑定完成后更新（session_start 里先 reset 再 start）。 */
  setPort(port: number): void {
    this.port = port;
  }

  clearOctssh(): void {
    this.octsshAvailable = false;
    this.octsshAliases = [];
    this.octsshUpdatedAt = 0;
  }

  /** 处理 octssh 侧发布的状态事件。 */
  applyOctsshEvent(event: OctsshApprovalEvent): void {
    this.octsshAvailable = true;
    this.octsshAliases = [...event.aliases];
    this.octsshUpdatedAt = event.at || Date.now();
  }

  /** 节流的 git 刷新；并发请求共享一次采集。 */
  refreshGit(force = false): Promise<void> {
    const now = Date.now();
    if (!force && this.git && now - this.lastGitRefreshAt < GIT_REFRESH_THROTTLE_MS) return Promise.resolve();
    if (this.gitPending) return this.gitPending;
    const cwd = this.cwd;
    this.gitPending = collectGitStatus(cwd)
      .then((git) => {
        this.git = git;
        this.lastGitRefreshAt = Date.now();
      })
      .finally(() => {
        this.gitPending = null;
      });
    return this.gitPending;
  }

  /** 关闭：清空全部状态并使快照失效。 */
  clear(): void {
    this.piSessionId = "";
    this.cwd = "";
    this.port = 0;
    this.startedAt = 0;
    this.clearOctssh();
    this.git = null;
    this.gitPending = null;
    this.lastGitRefreshAt = 0;
  }

  /** 当前快照；git 从未采集过时返回 null（HTTP 层补一次采集）。 */
  snapshot(): BridgeStateResponse | null {
    if (!this.piSessionId || !this.git) return null;
    return {
      ok: true,
      bridge: {
        piSessionId: this.piSessionId,
        cwd: this.cwd,
        port: this.port,
        startedAt: this.startedAt,
      },
      octssh: {
        available: this.octsshAvailable,
        aliases: [...this.octsshAliases],
        updatedAt: this.octsshUpdatedAt,
      },
      git: { ...this.git },
    };
  }
}

/** 绑定事件监听并返回取消函数（供测试与清理使用）。 */
export function wireOctsshEvents(
  events: { on(channel: string, handler: (data: unknown) => void): () => void },
  state: BridgeState,
): () => void {
  return events.on(OCTSSH_EVENT_CHANNEL, (data) => {
    if (typeof data !== "object" || data === null) return;
    const d = data as Partial<OctsshApprovalEvent>;
    if (!Array.isArray(d.aliases)) return;
    state.applyOctsshEvent({
      projectId: typeof d.projectId === "string" ? d.projectId : null,
      aliases: d.aliases.filter((a): a is string => typeof a === "string"),
      generation: typeof d.generation === "number" ? d.generation : 0,
      at: typeof d.at === "number" ? d.at : Date.now(),
    });
  });
}
