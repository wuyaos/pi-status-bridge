# pideck-plugin：会话状态桥

PiDeck Host Plugin，只读展示当前 Pi 会话的 OctSSH 免确认主机与 Git 摘要。

## 安装

仓库发布后，用 PiDeck 插件安装入口填入：

```
https://github.com/<you>/pi-status-bridge/tree/main/pideck-plugin
```

PiDeck 会读取本目录的 `pideck-plugin.json`（`permissions: ["network.local"]`，`network.localPorts: 47831-47838`）。

## 依赖

需要 Pi 会话内安装 `pi-status-bridge` Pi 扩展（仓库根目录），且 pi-octssh 为带状态事件发布 (`octssh:approval-changed`) 的适配版。无扩展时面板提示"未发现存活的桥接服务"。

## 隐私

面板只从 `http://127.0.0.1:47831-47838/state` 读取主机别名、分支名与计数等元数据；无任何执行、审批或写入接口。
