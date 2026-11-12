/**
 * 会话状态桥面板：只读。
 * 通过 pideck.network.request 探测本机回环端口段（manifest network.localPorts），
 * 并列显示全部存活桥接来源（piSessionId）、OctSSH 免确认主机别名与 Git 摘要。
 * 不猜测"当前会话"、不做目录/凭据配对；无任何写操作或执行接口。
 */

const PORTS = [47831, 47832, 47833, 47834, 47835, 47836, 47837, 47838];

function el(id) { return document.getElementById(id); }

async function fetchState(port) {
	try {
		const response = await pideck.network.request({
			url: `http://127.0.0.1:${port}/state`,
			method: "GET",
			timeoutMs: 4000,
		});
		if (!response || response.status !== 200) return null;
		const body = typeof response.body === "string" ? JSON.parse(response.body) : response.body;
		if (!body || body.ok !== true) return null;
		return { port, state: body };
	} catch {
		return null;
	}
}

async function fetchAllStates() {
	const results = await Promise.all(PORTS.map(fetchState));
	return results.filter(Boolean);
}

function fmtTime(ms) {
	if (!ms) return "—";
	return new Date(ms).toLocaleTimeString();
}

function render(entries) {
	// 无存活来源：直接清空旧显示，不保留过期内容。
	el("meta").textContent = entries.length
		? `存活桥接来源 ${entries.length} 个（并列展示，不代表当前 PiDeck 聊天）`
		: "未发现存活的 pi-status-bridge 桥接服务。请确认 Pi 会话内已安装 pi-status-bridge 扩展且会话已启动。";

	const oBody = el("octssh-body");
	const gBody = el("git-body");
	oBody.textContent = "";
	gBody.textContent = "";
	el("git").hidden = true;
	if (!entries.length) {
		oBody.className = "body muted";
		gBody.className = "body muted";
		return;
	}

	const octsshParts = [];
	const gitParts = [];
	let warn = false;
	for (const { port, state } of entries) {
		const b = state.bridge;
		const label = `来源 piSession ${String(b.piSessionId).slice(0, 8)} · 端口 ${port}`;
		const o = state.octssh;
		if (o.available) {
			warn = warn || o.aliases.length > 0;
			octsshParts.push(`${label}\n  ${o.aliases.length ? `⚠ 免确认：${o.aliases.join("、")}` : "未开启免确认"}`);
		} else {
			octsshParts.push(`${label}\n  未安装 OctSSH 或状态未上报`);
		}
		const g = state.git;
		if (!g.error) {
			const dirty = g.dirty + g.untracked;
			gitParts.push(
				`${label}\n  ${g.branch ?? "(detached)"}${g.ahead != null ? ` ↑${g.ahead} ↓${g.behind}` : ""} · ${dirty ? `未提交 ${g.dirty}${g.untracked ? ` +未跟踪 ${g.untracked}` : ""}` : "工作区干净"} · ${fmtTime(g.updatedAt)}`,
			);
		}
	}
	oBody.textContent = octsshParts.join("\n");
	oBody.className = "body " + (warn ? "warn" : "muted");
	gBody.textContent = gitParts.join("\n");
	el("git").hidden = gitParts.length === 0;
	gBody.className = "body";
}

let refreshing = false;
async function refresh() {
	if (refreshing) return;
	refreshing = true;
	try {
		const entries = await fetchAllStates();
		render(entries);
	} finally {
		refreshing = false;
	}
}

el("refresh").addEventListener("click", refresh);
pideck.onEvent((event) => {
	if (event.type === "sessions.changed") refresh();
});
refresh();

// 定时轮询：OctSSH 授权开关不触发 PiDeck 事件，靠约 3s 轮询保证面板最终一致。
const POLL_MS = 3000;
const pollTimer = setInterval(refresh, POLL_MS);
window.addEventListener("pagehide", () => clearInterval(pollTimer), { once: true });
window.addEventListener("unload", () => clearInterval(pollTimer), { once: true });
