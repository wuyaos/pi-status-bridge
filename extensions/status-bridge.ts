import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BridgeServer } from "../src/http.ts";
import { BridgeState, wireOctsshEvents } from "../src/state.ts";

/**
 * pi-status-bridge：只读桥接当前 Pi 会话的 OctSSH 免确认状态与 Git 摘要。
 *
 * - 不拦截/替换 ctx.ui.setStatus，不注册任何审批或执行接口。
 * - 仅通过 pi.events 接收 pi-octssh 发布的状态事件。
 * - 仅监听 127.0.0.1 固定端口段（与 pideck-plugin 的 network.localPorts 一致）。
 * - session_shutdown 完整清理：关服务器、清状态、退订事件；
 *   每次 session_start 重新订阅（扩展重载/新会话都会重建监听）。
 */
export default function statusBridgeExtension(pi: ExtensionAPI) {
  const state = new BridgeState();
  const server = new BridgeServer(state);
  let unsubscribe: (() => void) | null = null;

  pi.on("session_start", async (_event, ctx) => {
    // 生命周期顺序（同步段先于任何 await，无窗口竞态）：
    // 1) reset 清旧会话残留 → 2) 订阅 octssh 事件 → 3) 绑定端口并补 git。
    // 订阅后 reset 不再发生，事件不丢；octssh 侧 session_start 若晚于本步，
    // 其清空事件会正常到达；若早于本步，reset 本身就是清空，结果一致。
    if (unsubscribe) unsubscribe();
    state.reset({
      piSessionId: ctx.sessionManager.getSessionId() ?? "",
      cwd: ctx.cwd,
      port: server.port,
    });
    unsubscribe = wireOctsshEvents(pi.events, state);
    try {
      await server.stop();
      await server.start();
      state.setPort(server.port);
      await state.refreshGit(true);
    } catch {
      // 端口全忙等情况：不阻塞会话，插件侧表现为端口不可达。
    }
  });

  pi.on("session_shutdown", async () => {
    state.clear();
    await server.stop();
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
}
