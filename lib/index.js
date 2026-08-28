import { _ as WORKBUDDY_AUTH_FILE_ENV, a as readHostHeartbeat, b as parseWorkBuddyAuth, d as isKnownMultimodalModel, f as prepareChatBody, g as WORKBUDDY_AUTH_FILENAME, h as WorkBuddyCatalog, i as processStartTimeMs, l as WorkBuddyUpstreamClient, m as FALLBACK_WORKBUDDY_MODELS, n as clearHostHeartbeat, o as workbuddyHostHeartbeatPath, p as regionOf, r as isHeartbeatProcessAlive, s as writeHostHeartbeat, t as WORKBUDDY_HOST_HEARTBEAT_FILENAME, u as classifyUpstreamError, v as WorkBuddyCredentialStore, x as workbuddyOwnAuthPath, y as defaultDesktopAuthPath } from "./host-heartbeat.js";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
//#region src/adapter.ts
/**
* The `workbuddy` pi-ai provider: one loopback-backed adapter registered
* into the Harness LLM seam, assembled from public `dsh-llm-pi-ai`
* extension points the way `dsh-codex-connect` assembles its Codex route.
*
* @module dsh-workbuddy-connect/adapter
*/
/** Provider route this bundle owns. */
const WORKBUDDY_PROVIDER = "workbuddy";
/** Provider idle ceiling while one stream read is outstanding. */
const WORKBUDDY_STREAM_IDLE_TIMEOUT_MS = 3e5;
/**
* Image-request budgets at the dsh-llm-pi-ai defaults; the profile type made
* them required in 0.1.1-rc.2. Hy3 (and other multimodal routes) now advertise
* image input, so these bounds apply to picture attachments on those models.
*/
const REQUEST_IMAGE_BUDGETS = {
	maxRequestImageBytes: 20971520,
	requestImagePixelBudget: 4194304,
	requestImageMaxBytes: 1048576
};
/**
* Inert pi-ai auth plane. The workbuddy route authenticates only through the
* shim shared secret resolved per request by `resolveApiKey`, so pi-ai's own
* credential lifecycle and ambient discovery must never manufacture a
* credential for it. `PiAiAdapterOptions.auth` is required since 0.1.1-rc.2;
* every ambient question here answers "nothing stored, nothing set".
*/
const INERT_AUTH = {
	credentials: {
		async read() {},
		async list() {
			return [];
		},
		async modify() {
			throw new Error("dsh-workbuddy-connect: the workbuddy route has no pi-ai credential lifecycle");
		},
		async delete() {}
	},
	authContext: {
		async env() {},
		async fileExists() {
			return false;
		}
	}
};
/** No per-token pricing is knowable for a subscription quota; report zero. */
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
/** DSH thinking levels the WorkBuddy upstream never speaks. */
const UNSUPPORTED_THINKING_LEVELS = /* @__PURE__ */ new Set(["minimal", "xhigh"]);
/**
* Resolve the set of reasoning-effort levels one model actually offers.
*
* - A model that declares `supportedEfforts` (e.g. hy3-x: `["low","high"]`)
*   uses exactly those.
* - The hy3 family declares none on the CLI entry, but hy3-x does, so hy3 is
*   pinned to `["off","low","high","max"]`. `max` was verified against the
*   WorkBuddy upstream (2026-08-23): it emits real `reasoning_content` and
*   is heavier than the API `high` tier, which matches what the desktop UI's
*   "high" selection drives. `medium` stays excluded because the upstream
*   silently ignores it for hy3.
* - A model with no declared set (e.g. deepseek-v4-*) keeps the full generic
*   set including `medium`, so its levels stay selectable and are not clipped.
*/
function resolveEffortLevels(info) {
	if (Array.isArray(info.supportedEfforts) && info.supportedEfforts.length > 0) {
		const set = new Set(info.supportedEfforts);
		const levels = ["off"];
		for (const level of [
			"low",
			"medium",
			"high"
		]) if (set.has(level)) levels.push(level);
		return levels;
	}
	if (info.id.startsWith("hy3")) return [
		"off",
		"low",
		"high",
		"max"
	];
	return [
		"off",
		"low",
		"medium",
		"high"
	];
}
/** Build the per-model `thinkingLevelMap`: supported levels map to themselves, unsupported to `null`. */
function buildThinkingLevelMap(info) {
	const supported = new Set(resolveEffortLevels(info));
	const map = {
		off: supported.has("off") ? "off" : null,
		minimal: null,
		low: supported.has("low") ? "low" : null,
		medium: supported.has("medium") ? "medium" : null,
		high: supported.has("high") ? "high" : null,
		xhigh: null,
		max: supported.has("max") ? "max" : null
	};
	for (const level of UNSUPPORTED_THINKING_LEVELS) map[level] = null;
	return map;
}
/** Build one pi-ai model descriptor pointing at the loopback shim. */
function toPiModel(info, baseUrl) {
	const reasoningCapable = info.supportsReasoning || info.reasoningEffort !== void 0;
	const input = info.supportsVision === true || isKnownMultimodalModel(info.id) ? ["image", "text"] : ["text"];
	return {
		id: info.id,
		name: info.name,
		api: "openai-completions",
		provider: WORKBUDDY_PROVIDER,
		baseUrl,
		input,
		cost: NO_COST,
		contextWindow: info.contextWindow,
		maxTokens: info.maxTokens,
		...reasoningCapable ? {
			reasoning: true,
			thinkingLevelMap: buildThinkingLevelMap(info)
		} : {}
	};
}
/**
* Assemble the adapter. The provider's `getModels` reads the live catalog,
* and every model's `baseUrl` is re-resolved per read so the shim's
* ephemeral port applies from the first snapshot after startup.
*/
function createWorkBuddyAdapter(options) {
	const { shim, store, catalog, resolveAttachments } = options;
	const buildModels = () => {
		const baseUrl = `${shim.baseUrl()}/v1`;
		return catalog.current().map((info) => toPiModel(info, baseUrl));
	};
	const provider = {
		...createProvider({
			id: WORKBUDDY_PROVIDER,
			name: "WorkBuddy",
			auth: { apiKey: {
				name: "WorkBuddy OAuth bearer token",
				async resolve({ credential }) {
					const apiKey = credential?.key;
					return apiKey === void 0 || apiKey.length === 0 ? void 0 : {
						auth: { apiKey },
						source: "WorkBuddy"
					};
				}
			} },
			models: buildModels(),
			api: openAICompletionsApi()
		}),
		getModels: () => buildModels()
	};
	const profile = {
		provider: WORKBUDDY_PROVIDER,
		displayName: "WorkBuddy",
		streamIdleTimeoutMs: WORKBUDDY_STREAM_IDLE_TIMEOUT_MS,
		retryPolicy: resolveRetryPolicy(void 0, "dsh-workbuddy-connect retryPolicy"),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		...REQUEST_IMAGE_BUDGETS,
		piProvider: provider
	};
	let profiles = /* @__PURE__ */ new Map([[WORKBUDDY_PROVIDER, profile]]);
	return {
		adapter: new PiAiAdapter({
			profiles: () => profiles,
			auth: INERT_AUTH,
			resolveApiKey: async () => shim.token(),
			...resolveAttachments === void 0 ? {} : { resolveAttachments }
		}),
		invalidate: () => {
			profiles = /* @__PURE__ */ new Map([[WORKBUDDY_PROVIDER, profile]]);
		}
	};
}
//#endregion
//#region src/shim.ts
/**
* Loopback OpenAI-compatible endpoint. The pi-ai provider points here; the
* shim applies the WorkBuddy wire quirks (forced streaming, string
* `tool_choice`, CLI-shaped headers) and forwards to the real upstream.
* It binds 127.0.0.1 only and never serves another interface.
*
* Inbound hardening: the loopback bind alone is not a trust boundary (any
* local process or a DNS-rebinding page can reach 127.0.0.1), so every
* request must carry a loopback Host header, browser-sent Origins must be
* loopback, chat POSTs must be application/json, and the Authorization
* header must carry the shim's per-process shared secret. The plugin's
* own client satisfies all four by construction; local attackers cannot
* read the secret out of the plugin process's memory.
*
* @module dsh-workbuddy-connect/shim
*/
const REQUEST_BODY_LIMIT = 67108864;
/** Loopback hostnames the shim's own in-process client uses. */
const LOOPBACK_HOSTS = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"localhost",
	"[::1]"
]);
/** Strip the optional :port from a Host header value, IPv6-bracket aware. */
function hostnameOfHost(host) {
	let hostname = host.trim().toLowerCase();
	if (hostname.startsWith("[")) {
		const end = hostname.indexOf("]");
		return end === -1 ? hostname : hostname.slice(0, end + 1);
	}
	const colon = hostname.lastIndexOf(":");
	if (colon !== -1 && /^\d+$/.test(hostname.slice(colon + 1))) hostname = hostname.slice(0, colon);
	return hostname;
}
/**
* The request's Host header must name the loopback interface. A DNS-rebinding
* page (attacker domain re-resolved to 127.0.0.1) sends its own domain in
* Host, so this check drops those before any routing happens.
*/
function hostIsLoopback(host) {
	if (host === void 0 || host.trim() === "") return false;
	return LOOPBACK_HOSTS.has(hostnameOfHost(host));
}
/**
* A browser-sent Origin (present header) must be loopback. Non-browser
* clients (the plugin's own fetch calls) send no Origin at all and pass.
*/
function originIsLoopback(origin) {
	if (origin === void 0 || origin.trim() === "") return true;
	try {
		const { hostname } = new URL(origin);
		return LOOPBACK_HOSTS.has(hostname) || hostname === "::1";
	} catch {
		return false;
	}
}
/** Chat-completion POSTs must carry a JSON body type (simple-request CSRF drops here). */
function isJsonContentType(req) {
	const type = req.headers["content-type"];
	return typeof type === "string" && type.trim().toLowerCase().startsWith("application/json");
}
/** HTTP status each upstream failure class surfaces as. */
const KIND_STATUS = {
	hard_credit: 402,
	soft_rate: 429,
	session_dead: 401,
	not_found: 502,
	server: 502,
	client: 400
};
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
function writeOpenAIError(res, status, kind, message) {
	writeJson(res, status, { error: {
		message,
		type: kind,
		code: kind
	} });
}
/** Read a request body with a size cap; over-limit bodies fail the request. */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > REQUEST_BODY_LIMIT) {
				reject(/* @__PURE__ */ new Error("request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}
/**
* Start the loopback endpoint. Requests carry any bearer; the loopback bind
* is the boundary, and the upstream credential comes from the store alone.
*/
function createWorkBuddyShim(options) {
	const { store, client, catalog } = options;
	const logger = options.logger;
	const SHARED_SECRET = randomBytes(32).toString("base64url");
	/** Constant-time bearer check; absent or mismatched bearers are rejected. */
	function bearerOk(req) {
		const header = req.headers.authorization;
		if (typeof header !== "string") return false;
		const match = /^Bearer\s+(.+)$/i.exec(header.trim());
		if (match === null) return false;
		const presented = match[1];
		const expected = SHARED_SECRET;
		const a = Buffer.from(presented);
		const b = Buffer.from(expected);
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	}
	const server = createServer((req, res) => {
		handle(req, res);
	});
	const ready = new Promise((resolve, reject) => {
		server.once("listening", () => resolve());
		server.once("error", reject);
	});
	server.listen(0, "127.0.0.1");
	const baseUrl = () => {
		const address = server.address();
		if (address === null || typeof address === "string") throw new Error("workbuddy shim has no listening address");
		return `http://127.0.0.1:${address.port}`;
	};
	async function handle(req, res) {
		try {
			if (!hostIsLoopback(req.headers.host)) {
				writeOpenAIError(res, 403, "host_not_allowed", "Host header must name the loopback interface");
				return;
			}
			if (!originIsLoopback(req.headers.origin)) {
				writeOpenAIError(res, 403, "origin_not_allowed", "Origin must be a loopback origin");
				return;
			}
			if (!bearerOk(req)) {
				writeOpenAIError(res, 401, "unauthorized", "missing or invalid Authorization bearer");
				return;
			}
			const url = req.url ?? "/";
			if (req.method === "GET" && (url === "/healthz" || url === "/healthz/")) {
				writeJson(res, 200, { ok: true });
				return;
			}
			if (req.method === "GET" && (url === "/v1/models" || url === "/v1/models/")) {
				writeJson(res, 200, {
					object: "list",
					data: catalog.current().map((model) => ({
						id: model.id,
						object: "model",
						created: 0,
						owned_by: "workbuddy"
					}))
				});
				return;
			}
			if (req.method === "POST" && (url === "/v1/chat/completions" || url === "/v1/chat/completions/")) {
				await chatCompletions(req, res);
				return;
			}
			writeOpenAIError(res, 404, "not_found", `no such route: ${req.method} ${url}`);
		} catch (error) {
			if (!res.headersSent) writeOpenAIError(res, 500, "internal", String(error));
			else res.end();
		}
	}
	async function chatCompletions(req, res) {
		if (!isJsonContentType(req)) {
			writeOpenAIError(res, 415, "unsupported_media_type", "Content-Type must be application/json");
			return;
		}
		let credential;
		try {
			credential = await store.resolve();
		} catch (error) {
			writeOpenAIError(res, 401, "not_signed_in", String(error));
			return;
		}
		const raw = (await readBody(req)).toString("utf8");
		const prepared = prepareChatBody(raw);
		const controller = new AbortController();
		req.on("close", () => controller.abort());
		const result = await client.chatStream(credential, prepared, controller.signal);
		if (!result.ok) {
			writeOpenAIError(res, KIND_STATUS[result.kind], result.kind, `workbuddy upstream ${result.kind} (http ${result.status}): ${result.message.slice(0, 400)}`);
			return;
		}
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
			"X-Accel-Buffering": "no"
		});
		let sawDone = false;
		const body = Readable.fromWeb(result.response.body);
		body.on("data", (chunk) => {
			if (chunk.includes("[DONE]")) sawDone = true;
		});
		body.on("error", (error) => {
			logger?.warn("dsh-workbuddy-connect: upstream stream failed mid-flight", error);
			if (!sawDone && res.writable) res.end("data: [DONE]\n\n");
		});
		body.pipe(res);
	}
	return {
		ready,
		baseUrl,
		token: () => SHARED_SECRET,
		close: () => new Promise((resolve, reject) => {
			server.close(() => resolve());
			server.closeAllConnections();
			server.once("error", reject);
		})
	};
}
//#endregion
//#region src/status-paths.ts
/** Node-free constants and types shared by the Host and browser halves. */
/** Plugin-owned status endpoint consumed by its browser half. */
const WORKBUDDY_STATUS_PATH = "/plugins/dsh-workbuddy-connect/status";
/** Plugin-owned endpoint that persists the TinyFish API key into DSH's official
*  local credential store (`ctx.credentials`), consumed by the plugin card. */
const WORKBUDDY_SET_KEY_PATH = "/plugins/dsh-workbuddy-connect/set-tinyfish-key";
/** Plugin-owned endpoint that persists the web-search engine mode, consumed by the card. */
const WORKBUDDY_SET_MODE_PATH = "/plugins/dsh-workbuddy-connect/set-search-mode";
//#endregion
//#region src/key-store.ts
/**
* Local secret store for the plugin's own keys.
*
* DSH does not expose a `ctx.credentials` service in this runtime, so we mirror
* the approach used by the official `dsh-pocket` plugin: persist the secret to
* a 0600 file under `$DSH_HOME/<plugin>/` (cross-restart, process-local, no
* third-party service). The card's "Save" button calls the set-key endpoint,
* which writes here; search reads here first, then falls back to the env.
*
* @module dsh-workbuddy-connect/key-store
*/
/** Relative path under $DSH_HOME where the TinyFish key lives. */
const KEY_REL = join("dsh-workbuddy-connect", "tinyfish-key");
/** Relative path under $DSH_HOME where the web-search engine mode lives. */
const MODE_REL = join("dsh-workbuddy-connect", "search-mode");
/** Valid web-search engine modes. */
const VALID_MODES$1 = [
	"auto",
	"tinyfish-global",
	"system-global"
];
/** Absolute path of the persisted key file. */
function keyPath() {
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), KEY_REL);
}
/** Read the persisted TinyFish key, or `undefined` if unset / unreadable. */
function readTinyFishKey() {
	try {
		const v = readFileSync(keyPath(), "utf8").trim();
		return v.length > 0 ? v : void 0;
	} catch {
		return;
	}
}
/** Persist the TinyFish key with owner-only (0600) permissions. */
function writeTinyFishKey(key) {
	const p = keyPath();
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, key, { mode: 384 });
}
/** Absolute path of the persisted search-mode file. */
function modePath() {
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), MODE_REL);
}
/** Read the web-search engine mode, defaulting to `auto` when unset / invalid. */
function readSearchMode() {
	try {
		const v = readFileSync(modePath(), "utf8").trim();
		if (VALID_MODES$1.includes(v)) return v;
	} catch {}
	return "auto";
}
/** Persist the web-search engine mode (owner-only, 0600). */
function writeSearchMode(mode) {
	if (!VALID_MODES$1.includes(mode)) return;
	const p = modePath();
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, mode, { mode: 384 });
}
//#endregion
//#region src/web-status.ts
/** Redact token-like content before it crosses to the browser. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]").slice(0, 500);
}
function json(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
/** Loopback browser origins only; other devices are refused until trusted origins exist. */
function loopbackOrigin(req) {
	const origin = req.headers.origin;
	if (origin === void 0) return true;
	try {
		const { hostname } = new URL(origin);
		return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
	} catch {
		return false;
	}
}
/**
* Assemble the card's status document. Sign-in state is read-only; credit is
* a live billing answer whose failure degrades to `creditsError` rather than
* failing the whole document.
*/
async function workBuddyWebStatus(deps) {
	const tinyfishKeyConfigured = readTinyFishKey() !== void 0;
	const searchMode = readSearchMode();
	const authStatus = await deps.store.status();
	if (authStatus.state !== "signed-in") return {
		status: "signed-out",
		tinyfishKeyConfigured
	};
	const models = deps.catalog.current().map((model) => ({
		id: model.id,
		name: model.name,
		...model.credits === void 0 ? {} : { credits: model.credits },
		...model.descriptionZh === void 0 ? {} : { descriptionZh: model.descriptionZh },
		...model.reasoningEffort === void 0 ? {} : { reasoningEffort: model.reasoningEffort },
		...model.supportsVision === true ? { supportsVision: true } : { supportsVision: false }
	}));
	const status = {
		status: "signed-in",
		...authStatus.nickname === void 0 ? {} : { nickname: authStatus.nickname },
		...authStatus.domain === void 0 || authStatus.domain === "" ? {} : { domain: authStatus.domain },
		...authStatus.source === void 0 ? {} : { source: authStatus.source },
		...authStatus.expiresAtMs === void 0 ? {} : { expiresAt: authStatus.expiresAtMs },
		...models.length === 0 ? {} : { models },
		tinyfishKeyConfigured,
		searchMode
	};
	try {
		const credential = await deps.store.current();
		if (credential !== void 0) {
			const credits = await deps.client.fetchCredits(credential);
			return {
				...status,
				credits
			};
		}
	} catch (error) {
		return {
			...status,
			creditsError: safeMessage(error)
		};
	}
	return status;
}
/** Mount the GET status route on an optional webServer context. */
function registerWorkBuddyStatusRoute(ctx, deps) {
	ctx.effect(() => {
		const dispose = ctx.webServer.register({
			kind: "exact",
			path: WORKBUDDY_STATUS_PATH,
			handler: async (req, res) => {
				if (req.method !== "GET") {
					json(res, 405, { error: "method not allowed" });
					return;
				}
				if (!loopbackOrigin(req)) {
					json(res, 403, { error: "origin-not-trusted" });
					return;
				}
				try {
					json(res, 200, await workBuddyWebStatus(deps));
				} catch (error) {
					json(res, 500, { error: safeMessage(error) });
				}
			}
		});
		return () => {
			dispose();
		};
	}, "dsh-workbuddy-connect: Web status route");
}
//#endregion
//#region src/set-credential.ts
/** Public path of the set-key endpoint (also re-exported for host callers). */
const SET_TINYFISH_KEY_PATH = WORKBUDDY_SET_KEY_PATH;
function registerSetTinyFishKeyRoute(webCtx) {
	webCtx.effect(() => {
		const dispose = webCtx.webServer.register({
			kind: "exact",
			path: SET_TINYFISH_KEY_PATH,
			handler: async (req, res) => {
				if (req.method !== "POST") {
					res.writeHead(405, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "method not allowed" }));
					return;
				}
				let body = {};
				try {
					const buf = [];
					for await (const chunk of req) buf.push(chunk.toString());
					body = JSON.parse(buf.join("") || "{}");
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "invalid json" }));
					return;
				}
				const key = typeof body.key === "string" ? body.key.trim() : "";
				if (!key) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "missing key" }));
					return;
				}
				try {
					writeTinyFishKey(key);
					const configured = readTinyFishKey() !== void 0;
					webCtx.logger.info("workbuddy-connect: persisted TINYFISH_API_KEY to local key store");
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						ok: true,
						configured
					}));
				} catch (e) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
				}
			}
		});
		return () => {
			dispose();
		};
	}, "dsh-workbuddy-connect: set-tinyfish-key route");
}
//#endregion
//#region src/set-search-mode.ts
/** Public path of the set-mode endpoint (also re-exported for host callers). */
const SET_SEARCH_MODE_PATH = WORKBUDDY_SET_MODE_PATH;
const VALID_MODES = [
	"auto",
	"tinyfish-global",
	"system-global"
];
function registerSetSearchModeRoute(webCtx) {
	webCtx.effect(() => {
		const dispose = webCtx.webServer.register({
			kind: "exact",
			path: SET_SEARCH_MODE_PATH,
			handler: async (req, res) => {
				if (req.method !== "POST") {
					res.writeHead(405, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "method not allowed" }));
					return;
				}
				let body = {};
				try {
					const buf = [];
					for await (const chunk of req) buf.push(chunk.toString());
					body = JSON.parse(buf.join("") || "{}");
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "invalid json" }));
					return;
				}
				const mode = typeof body.mode === "string" ? body.mode.trim() : "";
				if (!VALID_MODES.includes(mode)) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "invalid mode" }));
					return;
				}
				try {
					writeSearchMode(mode);
					webCtx.logger.info("workbuddy-connect: persisted search mode to local store");
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						ok: true,
						mode
					}));
				} catch (e) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
				}
			}
		});
		return () => {
			dispose();
		};
	}, "dsh-workbuddy-connect: set-search-mode route");
}
//#endregion
//#region src/search-provider.ts
const TINYFISH_URL = "https://api.search.tinyfish.ai";
const DEEPSEEK_ANTHROPIC_URL = "https://api.deepseek.com/anthropic/v1/messages";
function decodeEntities(text) {
	return String(text).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function cleanSnippet(text) {
	if (!text) return void 0;
	return String(text).replace(/^\s*(#{1,6}\s*|>\s*)/gm, " ").replace(/\s+/g, " ").trim().slice(0, 400);
}
function uniqueSources(sources, limit) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const s of sources) {
		if (s.url && !seen.has(s.url)) {
			seen.add(s.url);
			out.push(s);
		}
		if (out.length >= limit) break;
	}
	return out;
}
/** TinyFish free search: GET with X-API-Key. Structured JSON results. */
async function searchTinyFish(query, maxResults, apiKey, signal) {
	const url = `${TINYFISH_URL}?${new URLSearchParams({
		query,
		location: "US",
		language: "zh"
	})}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15e3);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort);
	let response;
	try {
		response = await fetch(url, {
			headers: {
				"X-API-Key": apiKey,
				accept: "application/json",
				"user-agent": "deepseek-harness/workbuddy-connect"
			},
			signal: controller.signal
		});
	} catch (error) {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
		if (signal?.aborted) throw error;
		throw new Error(`TinyFish request failed: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
	if (!response.ok) {
		const detail = await response.text().catch(() => "");
		throw new Error(`TinyFish search error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
	}
	return { sources: uniqueSources(((await response.json().catch(() => null))?.results ?? []).filter((r) => r.url).map((r) => ({
		url: r.url,
		...r.title ? { title: decodeEntities(r.title) } : {},
		...r.snippet ? { snippet: cleanSnippet(decodeEntities(r.snippet)) } : {}
	})), maxResults) };
}
/** DeepSeek official web_search_20250305 via the Anthropic-shaped endpoint. */
async function searchDeepSeekOfficial(query, maxResults, apiKey, signal) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 2e4);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort);
	let response;
	try {
		response = await fetch(DEEPSEEK_ANTHROPIC_URL, {
			method: "POST",
			redirect: "error",
			headers: {
				"x-api-key": apiKey,
				authorization: `Bearer ${apiKey}`,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
				accept: "application/json",
				"user-agent": "deepseek-harness/workbuddy-connect"
			},
			body: JSON.stringify({
				model: "deepseek-v4-flash",
				max_tokens: 4096,
				messages: [{
					role: "user",
					content: [{
						type: "text",
						text: `Perform a web search for the query: ${query}`
					}]
				}],
				tools: [{
					type: "web_search_20250305",
					name: "web_search",
					max_uses: 1
				}]
			}),
			signal: controller.signal
		});
	} catch (error) {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
		if (signal?.aborted) throw error;
		throw new Error(`DeepSeek search request failed: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
	if (!response.ok) {
		const detail = await response.text().catch(() => "");
		throw new Error(`DeepSeek search error (HTTP ${response.status}): ${detail.slice(0, 200)}`);
	}
	const blocks = (await response.json().catch(() => null))?.content ?? [];
	const snippets = /* @__PURE__ */ new Map();
	for (const block of blocks) {
		if (block.type !== "text") continue;
		for (const cite of block.citations ?? []) if (cite.url && cite.cited_text && !snippets.has(cite.url)) snippets.set(cite.url, cite.cited_text);
	}
	const sources = [];
	for (const block of blocks) {
		if (block.type !== "web_search_tool_result") continue;
		for (const item of block.content ?? []) {
			if (item.type !== "web_search_result" || !item.url) continue;
			if (sources.some((s) => s.url === item.url)) continue;
			sources.push({
				url: item.url,
				...item.title ? { title: item.title } : {},
				...snippets.get(item.url) ? { snippet: cleanSnippet(snippets.get(item.url)) } : {},
				...item.page_age ? { publishedAt: item.page_age } : {}
			});
		}
	}
	return { sources: uniqueSources(sources, maxResults) };
}
function guardQuery(request) {
	const query = request.query;
	if (typeof query !== "string" || query.trim().length === 0) throw new Error("query is required");
	return {
		query,
		maxResults: Math.min(Math.max(Number(request.maxResults) || 5, 1), 20)
	};
}
/** Provider id used for the WorkBuddy (TinyFish) search route. */
const TINYFISH_PROVIDER_ID = "workbuddy-tinyfish";
/** Provider id used for the official DeepSeek search route. */
const DEEPSEEK_PROVIDER_ID = "deepseek-official";
/**
* Provider that routes search through TinyFish (free). Selected when the
* active conversation model's provider is `workbuddy`.
*/
function createTinyFishProvider(ctx, resolveKeys) {
	return {
		id: TINYFISH_PROVIDER_ID,
		available() {
			return true;
		},
		async search(request, signal) {
			const { query, maxResults } = guardQuery(request);
			const { tinyfishApiKey, deepseekApiKey } = await resolveKeys();
			if (!tinyfishApiKey) throw new Error("workbuddy-connect: TINYFISH_API_KEY is not set; cannot use the WorkBuddy search route");
			let lastError;
			for (let attempt = 1; attempt <= 3; attempt++) try {
				return await searchTinyFish(query, maxResults, tinyfishApiKey, signal);
			} catch (error) {
				lastError = error;
				error instanceof Error && error.message;
			}
			ctx.logger.warn("workbuddy-connect: TinyFish search failed after 3 attempts; falling back to system search");
			if (deepseekApiKey) try {
				return { sources: [{
					url: "https://tinyfish.ai/status",
					title: "⚠️ TinyFish 提示",
					snippet: "tinyfish 引擎出现故障，已自动恢复系统搜索引擎"
				}, ...(await searchDeepSeekOfficial(query, maxResults, deepseekApiKey, signal)).sources] };
			} catch (fallbackError) {
				fallbackError instanceof Error && fallbackError.message;
			}
			throw new Error(`TinyFish search failed after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
		}
	};
}
/**
* Provider that routes search through the official DeepSeek `web_search_20250305`
* call. Selected for every non-WorkBuddy model provider.
*/
function createDeepSeekOfficialProvider(ctx, resolveKeys) {
	return {
		id: DEEPSEEK_PROVIDER_ID,
		available() {
			return true;
		},
		async search(request, signal) {
			const { query, maxResults } = guardQuery(request);
			const { deepseekApiKey } = await resolveKeys();
			if (!deepseekApiKey) throw new Error("workbuddy-connect: DEEPSEEK_API_KEY is not set; cannot use the official search route");
			return await searchDeepSeekOfficial(query, maxResults, deepseekApiKey, signal);
		}
	};
}
//#endregion
//#region src/index.ts
/** Stable Cordis plugin name. */
const name = "llm-workbuddy";
/** The model registry required before the provider can register. */
const inject = ["llm", "web"];
/** Settings namespace reserved for the future configuration card. */
const WORKBUDDY_SETTINGS_NS = settingsNamespace("workbuddy");
const Config = z.object({ authFile: z.string().description("WorkBuddy desktop auth file (defaults to the app's own location)") });
/**
* Start the loopback endpoint, register the `workbuddy` provider, and
* refresh the model catalog from the upstream once credentials allow it.
* The static fallback catalog serves from the first moment, so an offline
* upstream never leaves the provider empty.
*/
function apply(ctx, config) {
	const client = new WorkBuddyUpstreamClient();
	const store = new WorkBuddyCredentialStore({
		...config.authFile === void 0 ? {} : { desktopPath: config.authFile },
		refresh: (credential) => client.refreshToken(credential)
	});
	const catalog = new WorkBuddyCatalog();
	const shim = createWorkBuddyShim({
		store,
		client,
		catalog,
		logger: ctx.logger
	});
	const resolveSearchKeys = async () => {
		const resolveEnv = async (env) => {
			if (env === "TINYFISH_API_KEY") {
				const stored = readTinyFishKey();
				if (stored) return stored;
			}
			return process.env[env] || void 0;
		};
		const [tinyfishApiKey, deepseekApiKey] = await Promise.all([resolveEnv("TINYFISH_API_KEY"), resolveEnv("DEEPSEEK_API_KEY")]);
		return {
			tinyfishApiKey,
			deepseekApiKey
		};
	};
	const tinyfish = createTinyFishProvider(ctx, resolveSearchKeys);
	const deepseek = createDeepSeekOfficialProvider(ctx, resolveSearchKeys);
	ctx.effect(() => {
		const disposers = [];
		disposers.push(ctx.web.registerSearchProvider(tinyfish));
		try {
			disposers.push(ctx.web.registerSearchProvider(deepseek));
		} catch (e) {
			ctx.logger.warn(`workbuddy-connect: deepseek-official already registered by DSH; reusing it (${e instanceof Error ? e.message : String(e)})`);
		}
		if (!ctx.web.searchProviderId) {
			ctx.web.searchProviderId = DEEPSEEK_PROVIDER_ID;
			ctx.logger.info(`workbuddy-connect: default web.searchProvider = "${DEEPSEEK_PROVIDER_ID}"`);
		}
		return () => {
			for (const d of disposers) d();
		};
	}, "dsh-workbuddy-connect: web search providers");
	ctx.on("agent/request", async (_payload, next) => {
		const config = await next();
		const provider = config?.provider;
		const hasKey = readTinyFishKey() !== void 0;
		const mode = readSearchMode();
		const target = hasKey && (mode === "tinyfish-global" || mode === "auto" && provider === "workbuddy") ? TINYFISH_PROVIDER_ID : DEEPSEEK_PROVIDER_ID;
		try {
			if (ctx.web.searchProviderId !== target) {
				ctx.web.searchProviderId = target;
				ctx.logger.info(`workbuddy-connect: provider "${provider}", mode "${mode}", key ${hasKey} -> web.searchProvider = "${target}"`);
			}
		} catch (e) {
			ctx.logger.warn(`workbuddy-connect: failed to switch search provider: ${e instanceof Error ? e.message : String(e)}`);
		}
		return config;
	});
	ctx.inject(["webServer"], (webCtx) => registerWorkBuddyStatusRoute(webCtx, {
		store,
		client,
		catalog
	}));
	ctx.inject(["webServer"], (webCtx) => registerSetTinyFishKeyRoute(webCtx));
	ctx.inject(["webServer"], (webCtx) => registerSetSearchModeRoute(webCtx));
	let current = () => config;
	installSettingsSection(ctx, WORKBUDDY_SETTINGS_NS, Config, config, {
		setSource(source) {
			current = source;
		},
		onChange() {
			const next = current().authFile;
			store.setDesktopPath(next);
		}
	});
	let stopped = false;
	ctx.effect(() => () => {
		stopped = true;
		shim.close();
		clearHostHeartbeat();
	});
	shim.ready.then(() => {
		if (stopped) return;
		let invalidate;
		try {
			const workbuddy = createWorkBuddyAdapter({
				shim,
				store,
				catalog,
				resolveAttachments: () => ctx.get("attachments")
			});
			invalidate = workbuddy.invalidate;
			let releaseAdapter;
			let releaseDirectory;
			try {
				releaseAdapter = ctx.llm.registerAdapter([WORKBUDDY_PROVIDER], workbuddy.adapter);
				releaseDirectory = ctx.llm.registerConfigurableProviders([{
					provider: WORKBUDDY_PROVIDER,
					displayName: "WorkBuddy",
					settingsNs: WORKBUDDY_SETTINGS_NS,
					settingsPath: [],
					declared: false
				}]);
			} finally {
				if (releaseAdapter === void 0 || releaseDirectory === void 0) {
					releaseAdapter?.();
					releaseDirectory?.();
				}
			}
			try {
				ctx.effect(() => () => {
					releaseAdapter?.();
					releaseDirectory?.();
				});
			} catch {
				releaseAdapter?.();
				releaseDirectory?.();
			}
			writeHostHeartbeat();
		} catch (error) {
			ctx.logger.error("dsh-workbuddy-connect: provider registration failed", error);
			return;
		}
		(async () => {
			try {
				const credential = await store.current();
				if (credential === void 0 || stopped) return;
				const models = await client.fetchModels(credential);
				if (stopped) return;
				catalog.set([...models]);
				invalidate?.();
			} catch (error) {
				ctx.logger.warn("dsh-workbuddy-connect: dynamic model catalog unavailable; serving the static fallback list", error);
			}
		})();
	}).catch((error) => {
		ctx.logger.error("dsh-workbuddy-connect: loopback endpoint failed to start; provider not registered", error);
	});
}
//#endregion
export { Config, FALLBACK_WORKBUDDY_MODELS, WORKBUDDY_AUTH_FILENAME, WORKBUDDY_AUTH_FILE_ENV, WORKBUDDY_HOST_HEARTBEAT_FILENAME, WORKBUDDY_PROVIDER, WORKBUDDY_SETTINGS_NS, WORKBUDDY_STREAM_IDLE_TIMEOUT_MS, WorkBuddyCatalog, WorkBuddyCredentialStore, WorkBuddyUpstreamClient, apply, classifyUpstreamError, clearHostHeartbeat, createWorkBuddyAdapter, createWorkBuddyShim, defaultDesktopAuthPath, inject, isHeartbeatProcessAlive, name, parseWorkBuddyAuth, prepareChatBody, processStartTimeMs, readHostHeartbeat, regionOf, workbuddyHostHeartbeatPath, workbuddyOwnAuthPath };
