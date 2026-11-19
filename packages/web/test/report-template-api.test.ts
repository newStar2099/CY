import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { handleReportTemplateApi } from "../src/report-template-api.ts";
import { ReportStore } from "../src/reports.ts";

const patch = {
	logo: "",
	logoHeight: 0,
	logoWidth: 0,
	name: "渗透测试报告",
	reviewer: "张三",
	showDate: true,
	title: "安全评估报告",
	watermarkEnabled: true,
	watermarkText: "内部资料",
};

let root: string;
let store: ReportStore;
let server: Server | undefined;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "cy-report-templates-"));
	store = new ReportStore(join(root, "reports.db"));
});
afterEach(async () => {
	if (server) {
		const closing = server;
		server = undefined;
		await new Promise<void>((resolve) => closing.close(() => resolve()));
	}
	store.close();
	rmSync(root, { recursive: true, force: true });
});

async function listen(
	handler: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void,
): Promise<number> {
	server = createServer(handler);
	await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("no port");
	return address.port;
}

async function call(
	port: number,
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; data: unknown }> {
	const response = await fetch(`http://127.0.0.1:${port}${path}`, {
		method,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	return { status: response.status, data: (await response.json()) as unknown };
}

test("template CRUD is scoped per user and persists across reopen", async () => {
	const mine = store.createTemplate("alice", patch);
	expect(mine).toMatchObject({ name: "渗透测试报告", title: "安全评估报告", showDate: true, watermarkEnabled: true });
	store.createTemplate("bob", { ...patch, name: "bob 模板" });

	expect(store.listTemplates("alice").map((template) => template.name)).toEqual(["渗透测试报告"]);
	expect(store.listTemplates("")).toEqual([]);

	const updated = store.updateTemplate("alice", mine.id, { ...patch, title: "修改标题" });
	expect(updated?.title).toBe("修改标题");
	expect(store.updateTemplate("bob", mine.id, { ...patch, title: "越权" })).toBeUndefined();

	store.close();
	store = new ReportStore(join(root, "reports.db"));
	expect(store.listTemplates("alice")[0]?.title).toBe("修改标题");
	expect(store.deleteTemplate("alice", mine.id)).toBe(true);
	expect(store.deleteTemplate("alice", mine.id)).toBe(false);
});

test("HTTP API validates payloads, scopes by user and supports create/update/delete", async () => {
	const userId = "alice";
	const port = await listen((request, response) => {
		void handleReportTemplateApi(request, response, store, userId);
	});

	const created = await call(port, "POST", "/api/report-templates", patch);
	expect(created.status).toBe(201);
	const template = created.data as { id: number; name: string };
	expect(template.name).toBe("渗透测试报告");

	const list = await call(port, "GET", "/api/report-templates");
	expect(list.status).toBe(200);
	expect((list.data as { total: number }).total).toBe(1);

	const invalid = await call(port, "POST", "/api/report-templates", { ...patch, name: "" });
	expect(invalid.status).toBe(400);

	// A 4 MB data URL exceeds the request body limit before validation runs.
	const oversize = await call(port, "POST", "/api/report-templates", {
		...patch,
		logo: `data:image/png;base64,${"A".repeat(4_000_000)}`,
	});
	expect(oversize.status).toBe(413);

	const updated = await call(port, "PUT", `/api/report-templates/${template.id}`, { ...patch, reviewer: "李四" });
	expect(updated.status).toBe(200);
	expect((updated.data as { reviewer: string }).reviewer).toBe("李四");

	const missing = await call(port, "PUT", "/api/report-templates/9999", patch);
	expect(missing.status).toBe(404);

	const removed = await call(port, "DELETE", `/api/report-templates/${template.id}`);
	expect(removed.status).toBe(200);
	expect((removed.data as { ok: boolean }).ok).toBe(true);
});

test("unauthorized non-GET requests are rejected with 401", async () => {
	const port = await listen((request, response) => {
		void handleReportTemplateApi(request, response, store, "alice", () => false);
	});
	const blocked = await call(port, "POST", "/api/report-templates", patch);
	expect(blocked.status).toBe(401);
});
