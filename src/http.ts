import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import type { BridgeState } from "./state.ts";
import { BRIDGE_HOST, BRIDGE_PORTS, isValidBridgeState } from "./types.ts";

/**
 * 只读回环 HTTP 服务：
 * - 仅监听 127.0.0.1
 * - 仅 GET /state 与 GET /health 两个端点，其余 404
 * - 不读取请求体，不提供任何写入/执行接口
 */
export class BridgeServer {

  private server: Server | null = null;
  private state: BridgeState;
  port = 0;

  constructor(state: BridgeState) {
    this.state = state;
  }

  /** 在 BRIDGE_PORTS 里绑定第一个空闲端口；全部占用则抛错。 */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let lastError: Error | null = null;
      let i = 0;
      const tryNext = () => {
        if (i >= BRIDGE_PORTS.length) {
          reject(lastError ?? new Error(`端口段 ${BRIDGE_PORTS[0]}-${BRIDGE_PORTS[BRIDGE_PORTS.length - 1]} 全部被占用`));
          return;
        }
        const port = BRIDGE_PORTS[i++];
        const server = createServer((req, res) => this.handle(req, res));
        server.on("error", (error: NodeJS.ErrnoException) => {
          server.close();
          lastError = error;
          tryNext();
        });
        server.listen(port, BRIDGE_HOST, () => {
          this.server = server;
          this.port = port;
          resolve();
        });
      };
      tryNext();
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.server;
      this.server = null;
      this.port = 0;
      if (!server) return resolve();
      server.close(() => resolve());
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${BRIDGE_HOST}`);
    try {
      if (req.method !== "GET") return this.send(res, 405, { ok: false, error: "method not allowed" });
      if (url.pathname === "/health") return this.send(res, 200, { ok: true });
      if (url.pathname !== "/state") return this.send(res, 404, { ok: false, error: "not found" });
      await this.state.refreshGit();
      const snap = this.state.snapshot();
      if (!snap) return this.send(res, 503, { ok: false, error: "state not ready" });
      if (!isValidBridgeState(snap)) return this.send(res, 500, { ok: false, error: "invalid state" });
      return this.send(res, 200, snap);
    } catch (error) {
      return this.send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  private send(res: ServerResponse, code: number, body: unknown): void {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  }
}
