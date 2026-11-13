/**
 * pi-status-bridge 共享类型。
 *
 * 安全边界：HTTP 响应只包含主机别名列表、Git 分支/计数等元数据。
 * 不含密钥、密码、聊天正文、工具结果、远端命令输出。
 */

/** 端口段：必须与 pideck-plugin.json 的 network.localPorts 完全一致。 */
export const BRIDGE_PORTS = [47831, 47832, 47833, 47834, 47835, 47836, 47837, 47838] as const;

export const BRIDGE_HOST = "127.0.0.1";

/** 单次 git 命令超时（毫秒）。 */
export const GIT_TIMEOUT_MS = 3000;

/** git 刷新节流间隔（毫秒）。 */
export const GIT_REFRESH_THROTTLE_MS = 5000;

/** OctSSH 状态事件通道（由 pi-octssh 的扩展 emit）。 */
export const OCTSSH_EVENT_CHANNEL = "octssh:approval-changed";

/** OctSSH 侧发布的状态载荷。 */
export interface OctsshApprovalEvent {
  /** OctSSH 的项目身份（octssh 内部 projectId）。 */
  projectId: string | null;
  /** 本会话已开启免确认的主机别名列表。 */
  aliases: string[];
  /** octssh 的代次计数：session_start/重载清空时递增，用于识别失效。 */
  generation: number;
  at: number;
}

/** HTTP /state 响应。 */
export interface BridgeStateResponse {
  ok: true;
  bridge: {
    /** Pi 会话 id（sessionManager.getSessionId()）。 */
    /** Pi 会话 id（sessionManager.getSessionId()）。 */
    piSessionId: string;
    /** 会话工作目录。 */
    cwd: string;
    /** 服务监听端口。 */
    port: number;
    /** 会话启动时间（epoch ms）。 */
    startedAt: number;
  };
  octssh: {
    /** 是否安装并已上报过 octssh 状态。false 时 aliases 无意义。 */
    available: boolean;
    /** 免确认主机别名；空数组 = 未开启或已清空。 */
    aliases: string[];
    /** 最后一次更新时间；0 = 未上报。 */
    updatedAt: number;
  };
  git: {
    /** 当前分支；detached HEAD 时为 null。 */
    branch: string | null;
    /** 未提交变更文件数（staged+unstaged，不含 untracked）。 */
    dirty: number;
    /** 未跟踪文件数。 */
    untracked: number;
    /** 领先上游提交数；无上游为 null。 */
    ahead: number | null;
    /** 落后上游提交数；无上游为 null。 */
    behind: number | null;
    /** 采集时间（epoch ms）。 */
    updatedAt: number;
    /** 采集失败原因（如非 git 仓库）。 */
    error?: string;
  };
  /** Ralph 循环状态（只读 <cwd>/.ralph/*.state.json 采集，与 Ralph 扩展同源）。 */
  ralph: RalphSummary;
}

/** Ralph 循环摘要（面板只展示这些，不包含任务正文）。 */
export interface RalphSummary {
  /** <cwd>/.ralph 目录可读。 */
  available: boolean;
  loops: Array<{
    name: string;
    status: "active" | "paused" | "completed";
    iteration: number;
    maxIterations: number;
  }>;
}

/** 解析 /state 响应的最小校验（插件侧也用同一形状）。 */
export function isValidBridgeState(value: unknown): value is BridgeStateResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.ok === true &&
    typeof v.bridge === "object" && v.bridge !== null &&
    typeof (v.bridge as Record<string, unknown>).piSessionId === "string" &&
    typeof v.octssh === "object" && v.octssh !== null &&
    typeof v.git === "object" && v.git !== null
  );
}
