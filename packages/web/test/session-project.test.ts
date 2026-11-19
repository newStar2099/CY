/**
 * Which project a session belongs to is resolved from its work directory, the
 * same way the runtime does it when a session is (re)built. A conversation must
 * keep its own project after the operator switches away, and a deleted project
 * must resolve to nothing rather than fall through to whichever project is on
 * screen — that fallthrough is how evidence and audit rows ended up in the
 * wrong project.
 */

import { expect, test } from "vitest";
import { resolveSessionProject } from "../src/cy-session.ts";
import type { CyProject } from "../src/projects.ts";

function project(id: string, name: string, workDir: string): CyProject {
	return { id, name, container: `cy-${id}`, workDir, createdAt: "2026-01-01T00:00:00.000Z" };
}

const A = project("p1", "项目 A", "/home/u/.cy/projects/aaa");
const B = project("p2", "项目 B", "/home/u/.cy/projects/bbb");

test("a session resolves to the project that owns its working directory", () => {
	expect(resolveSessionProject([A, B], "/home/u/.cy/projects/aaa")).toEqual({ id: "p1", name: "项目 A" });
	expect(resolveSessionProject([A, B], "/home/u/.cy/projects/bbb")).toEqual({ id: "p2", name: "项目 B" });
});

test("paths are compared after normalization", () => {
	expect(resolveSessionProject([A], "/home/u/.cy/projects/aaa/")).toEqual({ id: "p1", name: "项目 A" });
	expect(resolveSessionProject([A], "/home/u/.cy/projects/./aaa")).toEqual({ id: "p1", name: "项目 A" });
});

test("a deleted project resolves to nothing instead of borrowing the active one", () => {
	expect(resolveSessionProject([], "/home/u/.cy/projects/gone")).toBeUndefined();
	expect(resolveSessionProject([B], "/home/u/.cy/projects/gone")).toBeUndefined();
});
