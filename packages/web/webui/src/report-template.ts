/** Report appearance templates: active-template slot, REST client and markdown header injection. */
import type { ReportTemplatePatch, ReportTemplateRecord } from "../../src/report-types.ts";
import { getLanguage, t } from "./i18n.ts";

export type { ReportTemplatePatch, ReportTemplateRecord };

const tx = (zh: string, en: string) => (getLanguage() === "en" ? en : zh);

const ACTIVE_TEMPLATE_KEY = "cy.report.activeTemplateId";

/** Fired on `window` after every write so components mirroring the active
 * template in local state can re-read localStorage and re-render. */
export const ACTIVE_TEMPLATE_EVENT = "cy:report-active-template-changed";

function storage(): Storage | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		// Private mode may block storage entirely; callers fall back to defaults.
		return undefined;
	}
}

export function getActiveTemplateId(): number | null {
	const raw = storage()?.getItem(ACTIVE_TEMPLATE_KEY);
	if (!raw) return null;
	const id = Number.parseInt(raw, 10);
	return Number.isFinite(id) && id > 0 ? id : null;
}

export function setActiveTemplateId(id: number | null): void {
	try {
		if (id === null) storage()?.removeItem(ACTIVE_TEMPLATE_KEY);
		else storage()?.setItem(ACTIVE_TEMPLATE_KEY, String(id));
	} catch {
		// Storage may be disabled; the in-memory state of the caller stays authoritative.
	}
	window.dispatchEvent(new Event(ACTIVE_TEMPLATE_EVENT));
}

async function templateResponse(url: string, options?: RequestInit): Promise<Response> {
	const response = await fetch(url, options);
	if (!response.ok) {
		const body = await response.json().catch(() => null) as { error?: string } | null;
		throw new Error(body?.error ?? tx(`请求失败（${response.status}）`, `Request failed (${response.status})`));
	}
	return response;
}

export async function listReportTemplates(): Promise<ReportTemplateRecord[]> {
	const response = await templateResponse("/api/report-templates");
	const body = await response.json() as { reportTemplates?: ReportTemplateRecord[] };
	return body.reportTemplates ?? [];
}

export async function saveReportTemplate(
	patch: ReportTemplatePatch,
	id?: number,
): Promise<ReportTemplateRecord | null> {
	const response = await templateResponse(id ? `/api/report-templates/${id}` : "/api/report-templates", {
		method: id ? "PUT" : "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(patch),
	});
	return await response.json() as ReportTemplateRecord;
}

export async function deleteReportTemplate(id: number): Promise<boolean> {
	const response = await templateResponse(`/api/report-templates/${id}`, { method: "DELETE" });
	const body = await response.json() as { ok?: boolean };
	return body.ok === true;
}

/** Resolves the template marked active in localStorage; clears a stale id. */
export async function getActiveReportTemplate(): Promise<ReportTemplateRecord | null> {
	const id = getActiveTemplateId();
	if (id === null) return null;
	const templates = await listReportTemplates();
	const active = templates.find((template) => template.id === id) ?? null;
	if (!active) setActiveTemplateId(null);
	return active;
}

const formatNow = (): string => {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const formatToday = (): string => {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Watermark line rendered into PDF and DOCX exports; null when disabled. */
export const buildWatermark = (template: ReportTemplateRecord | null, userName?: string): string | null => {
	if (!template?.watermarkEnabled) return null;
	const parts = [userName?.trim(), formatNow(), template.watermarkText.trim()].filter((part) => part && part.length > 0);
	return parts.length > 0 ? parts.join(" · ") : null;
};

export const isTemplateEmpty = (template: ReportTemplateRecord | null): boolean => {
	if (!template) return true;
	return !template.title && !template.reviewer && !template.logo && !template.showDate;
};

/**
 * Injects the template header (logo, title, reviewer, date) into a markdown
 * report. The first H1 is replaced by the configured title; the logo is a
 * data-URL image whose alt text carries the pixel size ("logo-WxH") so the
 * PDF/DOCX renderers can scale it with the correct aspect ratio.
 */
export const applyReportTemplate = (markdown: string, template: ReportTemplateRecord | null): string => {
	if (isTemplateEmpty(template) || !template) return markdown;

	const lines = markdown.split("\n");
	const firstH1Index = lines.findIndex((line) => line.startsWith("# "));
	const originalTitle = firstH1Index >= 0 ? (lines[firstH1Index] ?? "").slice(2).trim() : "";

	const header: string[] = [];
	if (template.logo) {
		const width = template.logoWidth > 0 ? template.logoWidth : 0;
		const height = template.logoHeight > 0 ? template.logoHeight : 0;
		header.push(`![logo-${width}x${height}](${template.logo})`, "");
	}
	header.push(`# ${template.title || originalTitle}`, "");

	const meta: string[] = [];
	if (template.reviewer) meta.push(`**${t("审阅人")}**: ${template.reviewer}`);
	if (template.showDate) meta.push(`**${t("报告日期")}**: ${formatToday()}`);
	if (meta.length > 0) header.push(meta.join("  \n"), "");
	header.push("---", "");

	if (firstH1Index >= 0) lines.splice(firstH1Index, 1, ...header);
	else lines.unshift(...header);
	return lines.join("\n");
};
