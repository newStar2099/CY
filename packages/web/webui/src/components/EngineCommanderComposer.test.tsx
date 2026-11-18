import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { CyEngine, CyProjectInfo } from "../types.ts";
import { CommanderComposer } from "./EngineCommanderComposer.tsx";

const project: CyProjectInfo = { id: "p1", name: "Project", cwd: "/work/p1", container: "p1-container" };

test.each(["running", "completed", "paused", "scheduled", "stopped"] as const)("%s keeps the appropriate chat and attachment controls", (status: CyEngine["status"]) => {
	const html = renderToStaticMarkup(<CommanderComposer project={project} status={status} onSubmit={() => {}} />);
	const fileInput = html.match(/<input[^>]*type="file"[^>]*>/)?.[0];
	const textArea = html.match(/<textarea[^>]*>/)?.[0];
	expect(fileInput).toBeDefined();
	expect(textArea).toBeDefined();
	expect(fileInput?.includes("disabled")).toBe(status !== "running");
	expect(textArea?.includes("disabled")).toBe(status !== "running" && status !== "completed");
});

test("without a matching project uploads stay disabled", () => {
	const html = renderToStaticMarkup(<CommanderComposer project={null} status="running" onSubmit={() => {}} />);
	expect(html.match(/<input[^>]*type="file"[^>]*>/)?.[0]).toContain("disabled");
});
