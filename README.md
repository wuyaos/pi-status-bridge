# pi-status-bridge

Pi 扩展 + PiDeck Host Plugin：在 PiDeck 面板里并列显示本机存活 Pi 会话的 OctSSH 免确认主机与 Git 摘要（按来源 piSessionId 区分，**不代表当前 PiDeck 聊天**）。

## 组成

- 根目录：可 Git 安装的 Pi 扩展包（`pi install git:github.com/<you>/pi-status-bridge` 或本地路径）。`extensions/status-bridge.ts` 在 `session_start` 时于 `127.0.0.1:47831-47838` 绑定一个空闲端口，提供只读 HTTP 状态服务。
- `pideck-plugin/`：PiDeck Host Plugin 子目录，可通过公开仓库 `tree/main/pideck-plugin` URL 安装。

## 数据流

```
pi-octssh 扩展 --(pi.events "octssh:approval-changed")--> status-bridge 扩展
status-bridge 扩展 --(127.0.0.1 GET /state，只读 JSON)--> PiDeck 插件 pideck.network.request
```

`/state` 返回：`bridge`（piSessionId、cwd、端口）、`octssh`（available、aliases、updatedAt）、`git`（branch、dirty、untracked、ahead/behind、updatedAt）、`ralph`（available、loops[]：name/status/iteration/maxIterations）。不含密钥、聊天正文、工具结果或远端命令输出。

## 来源会话展示边界（重要）

PiDeck 插件 API 拿不到 piSessionId/filePath，无法建立 PiDeck 聊天 ↔ Pi 会话的可靠映射。本面板因此**不做当前会话匹配**：并列列出全部存活桥接来源，每条以 piSessionId 前 8 位标注；不猜测哪一条是"当前聊天"，由用户自行对照 ID。不提供手动配对/token。

- 只监听 `127.0.0.1`，只有 `GET /state`、`GET /health` 两个端点，无任何写入/执行/审批接口。
- 不拦截、不替换 `ctx.ui.setStatus`；不执行真实远端命令、不自动连接 SSH。
- `session_shutdown` 关闭服务器、清空状态、退订事件；OctSSH 免确认本身仍是会话级（会话结束/重载失效），桥只是展示。
- **本机同用户任意进程都可读取这些低敏状态**（主机别名、分支名、计数、piSessionId）：回环绑定只挡外部主机，无鉴权/token/PID 校验，属临时最小方案。不含密钥、聊天正文、工具结果。
- 面板不自动跟随当前 PiDeck 聊天切换；读取失败或无存活来源时**清除旧显示**，不保留过期内容。
- Ralph 循环状态直接只读各来源会话 cwd 下的 `.ralph/*.state.json`（与 pi-ralph-wiggum 扩展同一权威文件，逐次 /state 现读），不启动循环、不写任何状态文件；无 `.ralph` 目录或无活动循环时该卡片隐藏。
- 端口段固定 47831-47838，必须与 `pideck-plugin.json` 的 `network.localPorts` 一致（PiDeck 运行时按 manifest 校验 hostname=127.0.0.1 且端口在清单内）。

## 兼容与限制

- 需要 pi-octssh 的适配版（`/octssh allow-all` 等状态变化时向 `pi.events` 发布别名快照）。未装或未适配时 octssh 卡片显示"未安装或未上报"，其余功能不受影响。
- Git 摘要每次请求节流 5s，单次 `git status` 超时 3s。
- 端口段 8 个端口同时被占用时扩展启动桥失败（不阻塞会话）。

## 开发

```bash
npm install
npm run check   # typecheck + node --test
```

PiDeck 插件安装（开发期）：把 `pideck-plugin/` 目录放入 PiDeck host-plugins 或通过公开仓库子目录 URL 安装。
