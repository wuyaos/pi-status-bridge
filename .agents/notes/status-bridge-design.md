# pi-status-bridge 决策笔记

## 为什么用固定端口段 + manifest 预声明，而不是动态注册

PiDeck 主进程对 Host Plugin 网络请求做运行时校验（app.asar index.js：`url.hostname !== "127.0.0.1" || !manifest.network?.localPorts?.includes(port)` → `network-origin-denied`），端口白名单只能来自 manifest 静态声明（1–16 个），没有动态注册机制。因此扩展端 `session_start` 在 47831-47838 里挑第一个空闲端口，多个 Pi 进程自然错开；占用满则放弃（不阻塞会话）。

## 为什么按目录匹配而不是 piSessionId 唯一映射

PiDeck 插件可见的 session 字段只有 `{id, projectId, directory, ...}`，不含 piSessionId/filePath（asar 中 HostPluginSessions.toSession 实锤）；PiDeck 自己的目录数据插件 API 拿不到。故插件用 `context.directory` 与 `/state` 的 `bridge.cwd` 比对；同目录多进程全部列出并带 piSessionId 标注，不猜测唯一当前会话。这是 PiDeck API 边界，不是实现偷懒。

## 为什么用 pi.events 而不是读 OctSSH 内部状态

免确认状态的唯一权威是 pi-octssh 扩展内模块级 `SessionApproval`（内存 Map，键 projectId:identityKey），跨包读取需要导出内部实现且进程内才有效。跨扩展事件总线 `pi.events.on/emit`（EventBus: emit/on）是官方通道。适配在 4 个变更点 emit 快照（session_start 清空、session_shutdown 清空、allow-all on/off），best effort 静默失败，不影响 SSH 主流程。

## 备选被拒方案

- 扩展轮询/改写 `ctx.ui.setStatus` 文本解析：脆弱且违反"不拦截 setStatus"约束。
- PiDeck 插件直连 octssh：octssh 无 HTTP 接口，且会把授权状态暴露面扩大。
- 动态端口 + 注册文件：manifest 不支持动态端口，注册文件引入跨进程生命周期同步问题（孤儿文件、多进程竞争），固定段已覆盖 8 并发。

## 踩坑

- node --experimental-strip-types 不支持 TS 参数属性（`constructor(private x)`），src 需写成显式字段赋值。
- 测试里 `try { return promise } finally { rmSync }` 会在 promise resolve 前清理目录，导致 git status 失败——必须 async/await 后再清理。
- Windows 下 `git status --porcelain=v2 -z` 输出以 NUL 分隔，`# branch.head (detached)` 表示 detached HEAD。
