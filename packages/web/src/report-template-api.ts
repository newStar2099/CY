import type { IncomingMessage, ServerResponse } from "node:http";
import type { ReportTemplatePatch } from "./report-types.ts";
import type { ReportStore } from "./reports.ts";

function json(response: ServerResponse, body: unknown, status = 200): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
	response.end(JSON.stringify(body));
}

const TEMPLATE_LIMITS = { name: 100, title: 200, reviewer: 100, logo: 3_000_000, watermark: 200, size: 10_000 };

function readBody(request: IncomingMessage, limit: number): Promise<Buffer | null> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let oversized = false;
		void (async () => {
			try {
				for await (const chunk of request.iterator({ destroyOnReturn: false })) {
					const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
					size += bytes.length;
					if (size > limit) oversized = true;
					// Drain the rest of the body so the client can read the response
					// instead of hitting a connection reset mid-upload.
					else chunks.push(bytes);
				}
				resolve(oversized ? null : Buffer.concat(chunks));
			} catch {
				resolve(null);
			}
		})();
	});
}

/** Mirrors the upstream report-template validation: required name, bounded strings, data-URL logo. */
function parsePatch(body: unknown): ReportTemplatePatch | string {
	if (!body || typeof body !== "object") return "请提供模板数据。";
	const record = body as Record<string, unknown>;
	const text = (key: string, max: number): string | null => {
		const value = record[key];
		if (value === undefined || value === null) return "";
		if (typeof value !== "string") return null;
		return value.length > max ? null : value;
	};
	const name = text("name", TEMPLATE_LIMITS.name);
	const title = text("title", TEMPLATE_LIMITS.title);
	const reviewer = text("reviewer", TEMPLATE_LIMITS.reviewer);
	const logo = text("logo", TEMPLATE_LIMITS.logo);
	const watermarkText = text("watermarkText", TEMPLATE_LIMITS.watermark);
	if (name === null || title === null || reviewer === null || logo === null || watermarkText === null)
		return "模板字段缺失或超出长度限制。";
	if (!name.trim()) return "请填写模板名称。";
	if (logo && !/^data:image\/(png|jpeg|gif|bmp);base64,[A-Za-z0-9+/=]+$/.test(logo))
		return "Logo 必须是 PNG/JPEG/GIF/BMP 图片。";
	const number = (key: string): number | null => {
		const value = record[key];
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > TEMPLATE_LIMITS.size)
			return null;
		return value;
	};
	const logoWidth = number("logoWidth");
	const logoHeight = number("logoHeight");
	if (logoWidth === null || logoHeight === null) return "Logo 尺寸无效。";
	if (typeof record.showDate !== "boolean" || typeof record.watermarkEnabled !== "boolean")
		return "showDate 和 watermarkEnabled 必须是布尔值。";
	return {
		name: name.trim(),
		title: title.trim(),
		reviewer: reviewer.trim(),
		logo,
		logoWidth,
		logoHeight,
		showDate: record.showDate,
		watermarkText: watermarkText.trim(),
		watermarkEnabled: record.watermarkEnabled,
	};
}

/**
 * REST endpoints for per-user report appearance templates. The server applies
 * its normal gate and session checks before routing here; `userId` scopes
 * every row (empty string when auth is disabled, i.e. one shared namespace).
 */
export async function handleReportTemplateApi(
	request: IncomingMessage,
	response: ServerResponse,
	store: ReportStore,
	userId: string,
	authorized: () => boolean = () => true,
): Promise<void> {
	try {
		if (
			(request.method === "POST" || request.method === "PUT") &&
			!request.headers["content-type"]?.startsWith("application/json")
		) {
			// Drain the body before answering, or the client mid-upload hits a
			// connection reset instead of reading this 415 response.
			await readBody(request, Number.POSITIVE_INFINITY);
			json(response, { error: "请发送 JSON 请求。" }, 415);
			return;
		}
		const url = new URL(request.url ?? "/", "http://localhost");
		const parts = url.pathname.slice("/api/report-templates".length).split("/").filter(Boolean);
		if (parts.length === 0 && request.method === "GET") {
			const items = store.listTemplates(userId);
			json(response, { reportTemplates: items, total: items.length });
			return;
		}
		if (!authorized()) {
			json(response, { error: "登录或授权已失效，请刷新页面。" }, 401);
			return;
		}
		if (parts.length === 0 && request.method === "POST") {
			const body = await readBody(request, TEMPLATE_LIMITS.logo + 65536);
			if (!body) {
				json(response, { error: "请求内容过大。" }, 413);
				return;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(body.toString("utf8"));
			} catch {
				json(response, { error: "JSON 格式错误。" }, 400);
				return;
			}
			const patch = parsePatch(parsed);
			if (typeof patch === "string") {
				json(response, { error: patch }, 400);
				return;
			}
			json(response, store.createTemplate(userId, patch), 201);
			return;
		}
		const id = Number(parts[0]);
		if (!Number.isSafeInteger(id) || id < 1) {
			json(response, { error: "模板不存在。" }, 404);
			return;
		}
		if (parts.length === 1 && request.method === "PUT") {
			const body = await readBody(request, TEMPLATE_LIMITS.logo + 65536);
			if (!body) {
				json(response, { error: "请求内容过大。" }, 413);
				return;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(body.toString("utf8"));
			} catch {
				json(response, { error: "JSON 格式错误。" }, 400);
				return;
			}
			const patch = parsePatch(parsed);
			if (typeof patch === "string") {
				json(response, { error: patch }, 400);
				return;
			}
			const updated = store.updateTemplate(userId, id, patch);
			if (!updated) {
				json(response, { error: "模板不存在或已被删除。" }, 404);
				return;
			}
			json(response, updated);
			return;
		}
		if (parts.length === 1 && request.method === "DELETE") {
			json(response, { ok: store.deleteTemplate(userId, id) });
			return;
		}
		json(response, { error: "没有这个模板接口。" }, 404);
	} catch (error) {
		if (response.destroyed) return;
		json(response, { error: error instanceof Error ? error.message : String(error) }, 500);
	}
}
