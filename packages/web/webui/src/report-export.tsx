/** Browser-side report export pipeline: markdown to HTML / PDF / DOCX, with
 * archived report images inlined as data URLs and template headers preserved. */
import {
	AlignmentType,
	Document as DocxDocument,
	ExternalHyperlink,
	Header as DocxHeader,
	HeadingLevel,
	ImageRun,
	Packer,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableRow,
	TextRun,
} from "docx";
import { Marked, type RendererObject } from "marked";
import { Document, Font, Image as PDFImage, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReportDetail } from "../../src/report-types.ts";
import { getLanguage } from "./i18n.ts";
import type React from "react";

const tx = (zh: string, en: string) => (getLanguage() === "en" ? en : zh);

export function saveBlob(blob: Blob, fileName: string, extension: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${fileName}.${extension}`;
	link.style.display = "none";
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* Image inlining: archived report images become data URLs so the      */
/* standalone HTML/PDF/DOCX files carry their own image bytes.          */
/* ------------------------------------------------------------------ */

// CommonMark inline images: plain `![alt](url "title")` and the angle-bracket
// `![alt](<url with spaces> "title")` form. The capture regex keeps both.
const IMAGE_MARKDOWN = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"([^"]*)")?\s*\)/g;

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(tx("图片读取失败", "Failed to read image")));
		reader.onerror = () => reject(new Error(tx("图片读取失败", "Failed to read image")));
		reader.readAsDataURL(blob);
	});
}

function imageSize(dataUrl: string): Promise<{ height: number; width: number } | null> {
	return new Promise((resolve) => {
		const image = new window.Image();
		image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
		image.onerror = () => resolve(null);
		image.src = dataUrl;
	});
}

/** Fetches every archived image and rewrites its markdown reference to a
 * data-URL image whose alt text records the pixel size ("img-WxH"). */
export async function inlineArchiveImages(report: ReportDetail): Promise<string> {
	const sources = new Map(report.images.map((image) => [image.source, image.id]));
	if (sources.size === 0) return report.markdown;
	const replacements = new Map<string, string>();
	for (const [source, id] of sources) {
		try {
			const response = await fetch(`/api/reports/${report.id}/images/${encodeURIComponent(id)}?projectId=${encodeURIComponent(report.projectId)}`);
			if (!response.ok) continue;
			const dataUrl = await blobToDataUrl(await response.blob());
			const size = await imageSize(dataUrl);
			const alt = size ? `img-${size.width}x${size.height}` : "img";
			replacements.set(source, `![${alt}](${dataUrl})`);
		} catch {
			// A missing archive image exports as its original reference text.
		}
	}
	if (replacements.size === 0) return report.markdown;
	IMAGE_MARKDOWN.lastIndex = 0;
	let result = "";
	let cursor = 0;
	for (const match of report.markdown.matchAll(IMAGE_MARKDOWN)) {
		const source = match[2] ?? match[3];
		const replacement = source !== undefined ? replacements.get(source) : undefined;
		if (!replacement || match.index === undefined) continue;
		result += report.markdown.slice(cursor, match.index) + replacement;
		cursor = match.index + match[0].length;
	}
	return result + report.markdown.slice(cursor);
}

/* ------------------------------------------------------------------ */
/* HTML export                                                          */
/* ------------------------------------------------------------------ */

const htmlEscape = (text: string): string =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Report markdown aggregates untrusted content (agent output, data scraped
// from test targets). Marked passes raw HTML through verbatim, so the exported
// standalone file must never emit it unescaped — raw HTML renders as inert
// text, and link/image protocols are restricted to safe schemes.
const safeUrl = (href: string | undefined): string | null => {
	if (!href) return null;
	const trimmed = href.trim();
	let decoded = trimmed;
	try {
		decoded = decodeURIComponent(trimmed);
	} catch {
		// Malformed escape sequence — treat the raw value as the candidate.
	}
	if (/^([a-zA-Z][a-zA-Z0-9+.-]*):/.test(decoded)) {
		if (/^(https?|mailto):/i.test(decoded)) return trimmed;
		// Template logos and inlined archive images travel as raster image data
		// URLs; anything else (SVG, data:document, vbscript:…) stays inert text.
		if (/^data:image\/(png|jpeg|gif|bmp);base64,/i.test(decoded)) return trimmed;
		return null;
	}
	return trimmed;
};

const escapeAttr = (value: string): string => htmlEscape(value).replaceAll("'", "&#39;");

const sanitizedRenderer: RendererObject = {
	html({ text }) {
		return htmlEscape(text);
	},
	link({ href, title, tokens }) {
		const text = this.parser.parseInline(tokens);
		const safeHref = safeUrl(href);
		if (!safeHref) return text;
		const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
		return `<a href="${escapeAttr(safeHref)}"${titleAttr}>${text}</a>`;
	},
	image({ href, title, text, tokens }) {
		const alt = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : (text ?? "");
		const safeHref = safeUrl(href);
		if (!safeHref) return htmlEscape(alt);
		const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
		return `<img src="${escapeAttr(safeHref)}" alt="${escapeAttr(alt)}"${titleAttr}>`;
	},
};

const marked = new Marked({ gfm: true, renderer: sanitizedRenderer });

/** Renders template-decorated markdown into a standalone styled HTML file.
 * With `centerHeader` the blocks before the first horizontal rule (logo,
 * title, reviewer, date) are wrapped in a centered header container. */
export const generateHTMLFromMarkdown = async (content: string, fileName: string, centerHeader = false): Promise<void> => {
	let body = marked.parse(content, { async: false }) as string;
	if (centerHeader) {
		const hrMatch = /<hr\s*\/?>/.exec(body);
		if (hrMatch && hrMatch.index > 0) {
			const header = body.slice(0, hrMatch.index);
			const rest = body.slice(hrMatch.index);
			body = `<div class="report-header">${header}</div>${rest}`;
		}
	}
	const titleMatch = /^#\s+(.+)$/m.exec(content);
	const docTitle = titleMatch?.[1] ? htmlEscape(titleMatch[1]) : "Report";
	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${docTitle}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #334155;
    background: #f8fafc;
    line-height: 1.7;
    margin: 0;
    padding: 2rem 1rem;
  }
  .page {
    max-width: 900px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 3rem 4rem;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  }
  h1 { color: #0f172a; font-size: 1.7rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
  h2 { color: #1e293b; font-size: 1.35rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; margin-top: 2rem; }
  h3 { color: #334155; font-size: 1.15rem; margin-top: 1.6rem; }
  h4, h5, h6 { color: #475569; margin-top: 1.2rem; }
  img { max-width: 100%; height: auto; }
  /* Only the leading logo paragraph is size-capped; report body images keep full width. */
  .page > p:first-of-type img { max-width: 180px; max-height: 90px; }
  .report-header { text-align: center; }
  .report-header img { max-width: 180px; max-height: 90px; }
  code { font-family: ui-monospace, "Noto Sans Mono", Consolas, monospace; background: #f1f5f9; color: #dc2626; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
  pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 6px; overflow-x: auto; }
  pre code { background: transparent; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #cbd5e1; margin: 1rem 0; padding: 0.25rem 1rem; color: #64748b; background: #f8fafc; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #f1f5f9; color: #1e293b; }
  tr:nth-child(even) td { background: #f8fafc; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0; }
  a { color: #2563eb; }
  ul, ol { padding-left: 1.5rem; }
  @media print {
    body { background: #ffffff; padding: 0; }
    .page { border: none; box-shadow: none; padding: 0; max-width: none; }
  }
</style>
</head>
<body>
<div class="page">
${body}
</div>
</body>
</html>`;
	saveBlob(new Blob([html], { type: "text/html; charset=UTF-8" }), fileName, "html");
};

/* ------------------------------------------------------------------ */
/* DOCX export                                                          */
/* ------------------------------------------------------------------ */

type DocxInlineToken = {
	href?: string;
	text?: string;
	tokens?: DocxInlineToken[];
	type: string;
};

type DocxBlockToken = {
	align?: (string | null)[];
	depth?: number;
	header?: { text: string; tokens?: DocxInlineToken[] }[];
	items?: { tokens: DocxBlockToken[] }[];
	lang?: string;
	ordered?: boolean;
	rows?: { text: string; tokens?: DocxInlineToken[] }[][];
	start?: number;
	text?: string;
	tokens?: DocxInlineToken[];
	type: string;
};

const HEADING_LEVELS = [
	HeadingLevel.HEADING_1,
	HeadingLevel.HEADING_2,
	HeadingLevel.HEADING_3,
	HeadingLevel.HEADING_4,
	HeadingLevel.HEADING_5,
	HeadingLevel.HEADING_6,
];

const decodeDataUrl = (dataUrl: string): { data: Uint8Array<ArrayBuffer>; mime: string } | null => {
	const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
	if (!match) return null;
	try {
		const binary = atob(match[2] ?? "");
		const data = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
		return { data, mime: match[1] ?? "image/png" };
	} catch {
		return null;
	}
};

// docx@9 requires an explicit image type for each embedded image.
type DocxImageType = "bmp" | "gif" | "jpg" | "png";

const MIME_TO_IMAGE_TYPE: Record<string, DocxImageType> = {
	"image/bmp": "bmp",
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
};

// Logo images are data-URL images tagged "logo-WxH"; archived report images
// are tagged "img-WxH". Logos render at fixed height; body images scale to
// the page width. SVG (and other unsupported formats) is skipped.
const renderDocxImage = (token: DocxInlineToken): ImageRun | null => {
	if (!token.href) return null;
	const decoded = decodeDataUrl(token.href);
	if (!decoded) return null;
	const imageType = MIME_TO_IMAGE_TYPE[decoded.mime];
	if (!imageType) return null;
	const sizeMatch = /(?:logo|img)-(\d+)x(\d+)/.exec(token.text ?? "");
	const naturalWidth = sizeMatch ? Number.parseInt(sizeMatch[1] ?? "0", 10) : 0;
	const naturalHeight = sizeMatch ? Number.parseInt(sizeMatch[2] ?? "0", 10) : 0;
	const isLogo = (token.text ?? "").includes("logo-");
	const height = isLogo
		? 60
		: naturalWidth > 0 && naturalHeight > 0
			? Math.round(Math.min(420, (400 * naturalHeight) / naturalWidth))
			: 300;
	const width = isLogo
		? naturalWidth > 0 && naturalHeight > 0
			? Math.round((height * naturalWidth) / naturalHeight)
			: 160
		: naturalWidth > 0 && naturalHeight > 0
			? Math.round((height * naturalWidth) / naturalHeight)
			: 400;
	return new ImageRun({ data: decoded.data, transformation: { height, width }, type: imageType });
};

const renderDocxInlineText = (tokens: DocxInlineToken[] | undefined): string => {
	if (!tokens) return "";
	let text = "";
	for (const token of tokens) {
		if (token.type === "image") continue;
		text += token.text ?? renderDocxInlineText(token.tokens);
	}
	return text;
};

const renderDocxInlineTokens = (tokens: DocxInlineToken[] | undefined): (ExternalHyperlink | ImageRun | TextRun)[] => {
	if (!tokens) return [];
	const runs: (ExternalHyperlink | ImageRun | TextRun)[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case "strong":
				runs.push(new TextRun({ children: [renderDocxInlineText(token.tokens)], bold: true }));
				break;
			case "em":
				runs.push(new TextRun({ children: [renderDocxInlineText(token.tokens)], italics: true }));
				break;
			case "del":
				runs.push(new TextRun({ children: [renderDocxInlineText(token.tokens)], strike: true }));
				break;
			case "codespan":
				runs.push(new TextRun({ font: "Consolas", text: token.text ?? "" }));
				break;
			case "link":
				runs.push(
					new ExternalHyperlink({
						children: [new TextRun({ color: "2563EB", text: renderDocxInlineText(token.tokens) })],
						link: token.href ?? "#",
					}),
				);
				break;
			case "image": {
				const image = renderDocxImage(token);
				if (image) runs.push(image);
				break;
			}
			case "br":
				runs.push(new TextRun({ break: 1 }));
				break;
			case "text":
				if (token.tokens && token.tokens.length > 0) runs.push(...renderDocxInlineTokens(token.tokens));
				else runs.push(new TextRun({ text: token.text ?? "" }));
				break;
			default:
				break;
		}
	}
	return runs;
};

const renderDocxCodeBlock = (token: DocxBlockToken): Paragraph[] => {
	const lines = (token.text ?? "").split("\n");
	return lines.map(
		(line, index) =>
			new Paragraph({
				children: [new TextRun({ color: "E2E8F0", font: "Consolas", size: 18, text: line })],
				shading: { fill: "1E293B", type: ShadingType.CLEAR },
				spacing: { after: index === lines.length - 1 ? 160 : 0, before: index === 0 ? 120 : 0 },
			}),
	);
};

const renderDocxTable = (token: DocxBlockToken): Table => {
	const headerRow = new TableRow({
		children: (token.header ?? []).map(
			(cell) =>
				new TableCell({
					children: [new Paragraph({ children: [new TextRun({ bold: true, text: cell.text ?? "" })] })],
					shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
				}),
		),
		tableHeader: true,
	});
	const bodyRows = (token.rows ?? []).map(
		(row) =>
			new TableRow({
				children: row.map(
					(cell) => new TableCell({ children: [new Paragraph({ children: renderDocxInlineTokens(cell.tokens) })] }),
				),
			}),
	);
	return new Table({ rows: [headerRow, ...bodyRows] });
};

const renderDocxList = (token: DocxBlockToken, level: number): Paragraph[] => {
	const paragraphs: Paragraph[] = [];
	const items = token.items ?? [];
	items.forEach((item, index) => {
		const marker = token.ordered ? `${(token.start ?? 1) + index}. ` : "• ";
		item.tokens?.forEach((block) => {
			if (block.type === "list") {
				paragraphs.push(...renderDocxList(block, level + 1));
				return;
			}
			if (block.type === "space") return;
			paragraphs.push(
				new Paragraph({
					children: [
						new TextRun({ bold: true, color: "64748B", text: " ".repeat(level * 2) + marker }),
						...renderDocxInlineTokens(block.tokens),
					],
					indent: { left: 360 * (level + 1) },
					spacing: { after: 60 },
				}),
			);
		});
	});
	return paragraphs;
};

const renderDocxBlocks = (tokens: DocxBlockToken[], centerHeader = false): (Paragraph | Table)[] => {
	const children: (Paragraph | Table)[] = [];
	// When a report template is applied its header (logo, title, reviewer,
	// date) sits before the first horizontal rule — center those blocks.
	let headerZone = centerHeader;
	for (const token of tokens) {
		switch (token.type) {
			case "heading": {
				const level = Math.min(Math.max(token.depth ?? 1, 1), 6);
				children.push(
					new Paragraph({
						alignment: headerZone ? AlignmentType.CENTER : undefined,
						children: renderDocxInlineTokens(token.tokens),
						heading: HEADING_LEVELS[level - 1],
						spacing: { after: 120, before: level === 1 ? 0 : 200 },
					}),
				);
				break;
			}
			case "paragraph": {
				const runs = renderDocxInlineTokens(token.tokens);
				if (runs.length > 0) {
					children.push(
						new Paragraph({
							alignment: headerZone ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
							children: runs,
							spacing: { after: 140 },
						}),
					);
				}
				break;
			}
			case "code":
				children.push(...renderDocxCodeBlock(token));
				break;
			case "blockquote": {
				const inner = (token as { tokens?: DocxBlockToken[] }).tokens ?? [];
				if (inner.length > 0) {
					for (const block of inner) {
						if (block.type === "paragraph") {
							children.push(
								new Paragraph({
									children: renderDocxInlineTokens(block.tokens),
									indent: { left: 480 },
									spacing: { after: 100 },
								}),
							);
						} else if (block.type === "list") {
							children.push(...renderDocxList(block, 1));
						} else if (block.type === "heading") {
							children.push(
								new Paragraph({
									children: renderDocxInlineTokens(block.tokens),
									heading: HEADING_LEVELS[Math.min(Math.max(block.depth ?? 1, 1), 6) - 1],
									indent: { left: 480 },
								}),
							);
						}
					}
				} else if (token.text) {
					children.push(
						new Paragraph({
							children: [new TextRun({ color: "64748B", italics: true, text: token.text })],
							indent: { left: 480 },
						}),
					);
				}
				break;
			}
			case "list":
				children.push(...renderDocxList(token, 0));
				break;
			case "table":
				children.push(renderDocxTable(token));
				break;
			case "hr":
				children.push(
					new Paragraph({
						border: { bottom: { color: "CBD5E1", size: 6, style: "single", space: 1 } },
						spacing: { after: 200, before: 200 },
					}),
				);
				headerZone = false;
				break;
			default:
				break;
		}
	}
	return children;
};

/** Renders template-decorated markdown into a .docx download. The watermark
 * renders as a faint centered header on every page; `centerHeader` centers
 * the template header blocks before the first horizontal rule. */
export const generateDocxFromMarkdown = async (
	content: string,
	fileName: string,
	watermark?: string | null,
	centerHeader?: boolean,
): Promise<void> => {
	const tokens = marked.lexer(content) as DocxBlockToken[];
	const children = renderDocxBlocks(tokens, centerHeader);
	const doc = new DocxDocument({
		sections: [
			{
				children,
				headers: watermark
					? {
							default: new DocxHeader({
								children: [
									new Paragraph({
										alignment: AlignmentType.CENTER,
										children: [new TextRun({ color: "B7BCC4", size: 18, text: watermark })],
									}),
								],
							}),
						}
					: undefined,
				properties: {},
			},
		],
		styles: {
			default: {
				document: {
					run: { color: "334155", font: "Calibri", size: 22 },
				},
			},
		},
	});
	saveBlob(await Packer.toBlob(doc), fileName, "docx");
};

/* ------------------------------------------------------------------ */
/* PDF export (@react-pdf/renderer)                                     */
/* ------------------------------------------------------------------ */

const CJK_RE =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\uff00-\uffef]+/gu;
const HAS_CJK_RE =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\uff00-\uffef]/u;

let hasBaseFonts = false;
let hasCJKFonts = false;

const registerBaseFonts = (): void => {
	if (hasBaseFonts) return;
	Font.register({
		family: "NotoSans",
		fonts: [
			{ fontStyle: "normal", fontWeight: "normal", src: "/fonts/NotoSans-Regular.ttf" },
			{ fontStyle: "normal", fontWeight: "bold", src: "/fonts/NotoSans-Bold.ttf" },
			{ fontStyle: "italic", fontWeight: "normal", src: "/fonts/NotoSans-Italic.ttf" },
			{ fontStyle: "italic", fontWeight: "bold", src: "/fonts/NotoSans-BoldItalic.ttf" },
		],
	});
	Font.register({
		family: "NotoSansMono",
		fonts: [
			{ fontStyle: "normal", fontWeight: "normal", src: "/fonts/NotoSansMono-Regular.ttf" },
			{ fontStyle: "normal", fontWeight: "bold", src: "/fonts/NotoSansMono-Bold.ttf" },
		],
	});
	Font.registerHyphenationCallback((word) => [word]);
	hasBaseFonts = true;
};

const registerCJKFonts = (): void => {
	if (hasCJKFonts) return;
	Font.register({
		family: "NotoSansSC",
		fonts: [
			{ fontStyle: "normal", fontWeight: "normal", src: "/fonts/NotoSansSC-Regular.otf" },
			{ fontStyle: "normal", fontWeight: "bold", src: "/fonts/NotoSansSC-Bold.otf" },
		],
	});
	hasCJKFonts = true;
};

const ensureFonts = (content: string): void => {
	registerBaseFonts();
	if (HAS_CJK_RE.test(content)) registerCJKFonts();
};

interface TextSegment {
	isCJK: boolean;
	text: string;
}

/** Splits a string into alternating non-CJK and CJK segments so each segment
 * renders with the appropriate font family. */
const splitByCJK = (text: string): TextSegment[] => {
	const segments: TextSegment[] = [];
	let lastIndex = 0;
	CJK_RE.lastIndex = 0;
	let match: null | RegExpExecArray;
	while ((match = CJK_RE.exec(text)) !== null) {
		if (match.index > lastIndex) segments.push({ isCJK: false, text: text.slice(lastIndex, match.index) });
		segments.push({ isCJK: true, text: match[0] });
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) segments.push({ isCJK: false, text: text.slice(lastIndex) });
	return segments.length > 0 ? segments : [{ isCJK: false, text }];
};

const pdfStyles = StyleSheet.create({
	bold: { fontWeight: "bold" },
	code: { color: "#dc2626", fontFamily: "NotoSansMono", fontSize: 9, fontWeight: "bold" },
	codeBlock: {
		backgroundColor: "#1e293b",
		borderColor: "#334155",
		borderRadius: 4,
		borderWidth: 1,
		color: "#e2e8f0",
		fontFamily: "NotoSansMono",
		fontSize: 8.5,
		lineHeight: 1.4,
		marginBottom: 8,
		marginTop: 4,
		padding: 8,
	},
	h1: { color: "#0f172a", fontSize: 16, fontWeight: "bold", marginBottom: 10, marginTop: 0 },
	h2: {
		borderBottomColor: "#e2e8f0",
		borderBottomWidth: 1,
		color: "#1e293b",
		fontSize: 14,
		fontWeight: "bold",
		marginBottom: 8,
		marginTop: 12,
		paddingBottom: 4,
	},
	h3: { color: "#334155", fontSize: 13, fontWeight: "bold", marginBottom: 6, marginTop: 10 },
	h4: { color: "#475569", fontSize: 12, fontWeight: "bold", marginBottom: 5, marginTop: 8 },
	h5: { color: "#64748b", fontSize: 11, fontWeight: "bold", marginBottom: 4, marginTop: 6 },
	h6: { color: "#94a3b8", fontSize: 10, fontWeight: "bold", marginBottom: 4, marginTop: 6 },
	hr: { borderBottomColor: "#cbd5e1", borderBottomWidth: 1, marginBottom: 12, marginTop: 12 },
	italic: { fontStyle: "italic" },
	link: { color: "#2563eb", fontWeight: "semibold", textDecoration: "underline" },
	list: { marginBottom: 8, marginLeft: 0, marginTop: 6 },
	listBullet: { color: "#64748b", fontSize: 9, marginRight: 8, minWidth: 20 },
	listContent: { color: "#334155", flex: 1, fontSize: 10, lineHeight: 1.5 },
	listItem: { alignItems: "flex-start", flexDirection: "row", marginBottom: 4, marginLeft: 16 },
	page: {
		backgroundColor: "#ffffff",
		color: "#334155",
		fontFamily: "NotoSans",
		fontSize: 10,
		lineHeight: 1.5,
		padding: 40,
	},
	paragraph: { color: "#475569", lineHeight: 1.6, marginBottom: 8, textAlign: "justify" },
	table: { borderColor: "#cbd5e1", borderWidth: 1, marginBottom: 8, marginTop: 6 },
	tableCell: { flexGrow: 1, padding: 5 },
	tableCellText: { color: "#334155", fontSize: 9 },
	tableHeaderRow: { backgroundColor: "#f1f5f9" },
	tableHeaderText: { color: "#0f172a", fontSize: 9, fontWeight: "bold" },
	tableRow: { borderBottomColor: "#e2e8f0", borderBottomWidth: 1, flexDirection: "row" },
	watermark: { left: 0, position: "absolute", right: 0, top: "45%" },
	watermarkText: { color: "#94a3b8", fontFamily: "NotoSans", fontSize: 42, opacity: 0.12, textAlign: "center" },
});

// @react-pdf/renderer has spotty emoji glyph support — substitute readable text tags instead.
const emojiMap: Record<string, string> = {
	"⏳": "[WAIT]",
	"⚠️": "[WARN]",
	"⚡": "[RUN]",
	"✅": "[OK]",
	"✨": "[NEW]",
	"❌": "[FAIL]",
	"🎯": "[TARGET]",
	"🐛": "[BUG]",
	"💡": "[IDEA]",
	"📊": "[DATA]",
	"📝": "[NOTE]",
	"🔍": "[SEARCH]",
	"🔐": "[SEC]",
	"🔧": "[TOOL]",
	"🚀": "[START]",
};

const replaceEmojis = (text: string): string => {
	let result = text;
	for (const [emoji, replacement] of Object.entries(emojiMap)) result = result.replaceAll(emoji, replacement);
	return result;
};

interface PdfInlineToken {
	bold?: boolean;
	code?: boolean;
	italic?: boolean;
	link?: string;
	text: string;
	type: "text";
}

interface PdfContent {
	content?: string;
	header?: PdfInlineToken[][];
	height?: number;
	inlineTokens?: PdfInlineToken[];
	items?: { inlineTokens: PdfInlineToken[]; raw: string }[];
	level?: number;
	ordered?: boolean;
	rows?: PdfInlineToken[][][];
	src?: string;
	type: string;
	width?: number;
}

const parsePdfInlineTokens = (text: string): PdfInlineToken[] => {
	const tokens: PdfInlineToken[] = [];
	const inlineTokens = marked.lexer(text, { breaks: false });
	const firstToken = inlineTokens[0];
	if (firstToken && firstToken.type === "paragraph" && "tokens" in firstToken) {
		const paragraphTokens =
			(firstToken as { tokens?: unknown[] }).tokens?.filter(
				(token): token is Record<string, unknown> => typeof token === "object" && token !== null,
			) || [];
		paragraphTokens.forEach((token) => {
			switch (token.type) {
				case "codespan":
					tokens.push({ code: true, text: replaceEmojis(String(token.text || "")), type: "text" });
					break;
				case "em":
					tokens.push({ italic: true, text: replaceEmojis(String(token.text || "")), type: "text" });
					break;
				case "link":
					tokens.push({ link: String(token.href || ""), text: replaceEmojis(String(token.text || "")), type: "text" });
					break;
				case "strong":
					tokens.push({ bold: true, text: replaceEmojis(String(token.text || "")), type: "text" });
					break;
				case "text":
					tokens.push({ text: replaceEmojis(String(token.text || "")), type: "text" });
					break;
				default:
					if ("text" in token)
						tokens.push({ text: replaceEmojis(String(token.text || "")), type: "text" });
			}
		});
	} else {
		tokens.push({ text: replaceEmojis(text), type: "text" });
	}
	return tokens;
};

const parsePdfTokens = (markdown: string): PdfContent[] => {
	const tokens = marked.lexer(markdown);
	const result: PdfContent[] = [];
	const processToken = (token: Record<string, unknown>): void => {
		switch (token.type) {
			case "code":
				result.push({ content: replaceEmojis(String(token.text || "")), type: "code" });
				break;
			case "heading":
				result.push({
					inlineTokens: parsePdfInlineTokens(String(token.text || "")),
					level: Number(token.depth || 1),
					type: "heading",
				});
				break;
			case "hr":
				result.push({ type: "hr" });
				break;
			case "list": {
				const tokenItems = (Array.isArray(token.items) ? token.items : []) as Array<Record<string, unknown>>;
				result.push({
					items: tokenItems.map((item) => ({
						inlineTokens: parsePdfInlineTokens(String(item.text || "")),
						raw: String(item.text || ""),
					})),
					ordered: Boolean(token.ordered),
					type: "list",
				});
				break;
			}
			case "paragraph": {
				// Data-URL image lines (template logo and inlined report images)
				// keep their data URL and original pixel size.
				const imgMatch = /^!\[(?:logo|img)-(\d+)x(\d+)\]\((data:[^)\s]+)\)\s*$/.exec(String(token.raw || "").trim());
				if (imgMatch) {
					result.push({
						height: Number.parseInt(imgMatch[2] ?? "0", 10),
						src: imgMatch[3],
						type: "image",
						width: Number.parseInt(imgMatch[1] ?? "0", 10),
					});
					break;
				}
				result.push({ inlineTokens: parsePdfInlineTokens(String(token.text || "")), type: "paragraph" });
				break;
			}
			case "space":
				break;
			case "table": {
				const headerRow = (Array.isArray(token.header) ? token.header : []) as Array<Record<string, unknown>>;
				const bodyRows = (Array.isArray(token.rows) ? token.rows : []) as Array<
					Array<Record<string, unknown>>
				>;
				result.push({
					header: headerRow.map((cell) => parsePdfInlineTokens(String(cell.text || ""))),
					rows: bodyRows.map((row) =>
						(Array.isArray(row) ? row : []).map((cell) => parsePdfInlineTokens(String(cell.text || ""))),
					),
					type: "table",
				});
				break;
			}
			default:
				if ("text" in token && typeof token.text === "string") {
					result.push({ inlineTokens: parsePdfInlineTokens(token.text), type: "paragraph" });
				}
		}
	};
	tokens.forEach((token) => processToken(token as Record<string, unknown>));
	return result;
};

/** Splits CJK segments so each chunk renders with the matching font family —
 * Noto Sans for Latin/Cyrillic, Noto Sans SC for CJK. CJK fonts have no true
 * italic variant, so italic is dropped for those segments. */
const renderTextWithCJK = (
	text: string,
	baseFamily: string,
	boldFamily: string,
	keyPrefix: string,
	bold = false,
	italic = false,
): React.ReactNode => {
	const segments = splitByCJK(text);
	if (segments.length === 1 && !segments[0]?.isCJK) return text;
	return segments.map((segment, index) => {
		const family = segment.isCJK ? "NotoSansSC" : bold ? boldFamily : baseFamily;
		const style: Record<string, string> = { fontFamily: family };
		if (bold && !segment.isCJK) style.fontWeight = "bold";
		if (italic && !segment.isCJK) style.fontStyle = "italic";
		return (
			<Text key={`${keyPrefix}-cjk-${index}`} style={style}>
				{segment.text}
			</Text>
		);
	});
};

const renderPdfInlineTokens = (tokens: PdfInlineToken[], keyPrefix: string): React.ReactNode[] =>
	tokens.map((token, index) => {
		const appliedStyles = [];
		if (token.code) appliedStyles.push(pdfStyles.code);
		if (token.bold) appliedStyles.push(pdfStyles.bold);
		if (token.italic) appliedStyles.push(pdfStyles.italic);
		if (token.link) appliedStyles.push(pdfStyles.link);
		if (appliedStyles.length > 0) {
			const rendered =
				token.code || token.link
					? token.text
					: renderTextWithCJK(token.text, "NotoSans", "NotoSans", `${keyPrefix}-inline-${index}`, !!token.bold, !!token.italic);
			return (
				<Text key={`${keyPrefix}-inline-${index}`} style={appliedStyles}>
					{rendered}
				</Text>
			);
		}
		const rendered = renderTextWithCJK(token.text, "NotoSans", "NotoSans", `${keyPrefix}-inline-${index}`);
		if (typeof rendered === "string") return rendered;
		return <Text key={`${keyPrefix}-inline-${index}`}>{rendered}</Text>;
	});

const renderPdfContent = (parsed: PdfContent[], centerHeader = false) => {
	// When a report template is applied its header (logo, title, reviewer,
	// date) sits before the first horizontal rule — center those blocks.
	const firstHrIndex = parsed.findIndex((item) => item.type === "hr");
	const isInHeader = (index: number): boolean => centerHeader && firstHrIndex >= 0 && index < firstHrIndex;
	return parsed
		.map((item, index) => {
			const centered = isInHeader(index);
			switch (item.type) {
				case "code": {
					if (!item.content) return null;
					return (
						<Text key={`code-${index}`} style={pdfStyles.codeBlock}>
							{item.content}
						</Text>
					);
				}
				case "heading": {
					if (!item.inlineTokens || item.inlineTokens.length === 0) return null;
					const style =
						item.level === 1
							? pdfStyles.h1
							: item.level === 2
								? pdfStyles.h2
								: item.level === 3
									? pdfStyles.h3
									: item.level === 4
										? pdfStyles.h4
										: item.level === 5
											? pdfStyles.h5
											: pdfStyles.h6;
					return (
						<Text key={`heading-${index}`} style={centered ? { ...style, textAlign: "center" } : style}>
							{renderPdfInlineTokens(item.inlineTokens, `heading-${index}`)}
						</Text>
					);
				}
				case "image": {
					if (!item.src) return null;
					if (centered) {
						// Logo images in the template header: cap height at 72pt,
						// keep the original aspect ratio.
						const height = item.height && item.height > 0 ? Math.min(item.height, 72) : 48;
						const width =
							item.width && item.height && item.width > 0 && item.height > 0
								? Math.round((height * item.width) / item.height)
								: 160;
						return (
							<View key={`image-${index}`} style={{ alignItems: "center", marginBottom: 10 }}>
								<PDFImage src={item.src} style={{ height, width }} />
							</View>
						);
					}
					// Body images scale to the printable width while keeping aspect.
					const height =
						item.width && item.height && item.width > 0 && item.height > 0
							? Math.round(Math.min(item.height, (470 * item.height) / item.width))
							: 300;
					const width =
						item.width && item.height && item.width > 0 && item.height > 0
							? Math.round((height * item.width) / item.height)
							: 470;
					return (
						<PDFImage
							key={`image-${index}`}
							src={item.src}
							style={{ height, marginBottom: 10, width }}
						/>
					);
				}
				case "hr":
					return <View key={`hr-${index}`} style={pdfStyles.hr} />;
				case "list": {
					if (!item.items || item.items.length === 0) return null;
					return (
						<View key={`list-${index}`} style={pdfStyles.list}>
							{item.items.map((listItem, itemIndex) => (
								<View key={`li-${index}-${itemIndex}`} style={pdfStyles.listItem}>
									<Text style={pdfStyles.listBullet}>{item.ordered ? `${itemIndex + 1}.` : "•"}</Text>
									<Text style={pdfStyles.listContent}>
										{renderPdfInlineTokens(listItem.inlineTokens, `li-${index}-${itemIndex}`)}
									</Text>
								</View>
							))}
						</View>
					);
				}
				case "paragraph": {
					if (!item.inlineTokens || item.inlineTokens.length === 0) return null;
					return (
						<Text
							key={`para-${index}`}
							style={centered ? { ...pdfStyles.paragraph, textAlign: "center" } : pdfStyles.paragraph}
						>
							{renderPdfInlineTokens(item.inlineTokens, `para-${index}`)}
						</Text>
					);
				}
				case "table": {
					const headerCells = item.header ?? [];
					const bodyRows = item.rows ?? [];
					const columnCount = Math.max(headerCells.length, ...bodyRows.map((row) => row.length));
					if (columnCount === 0) return null;
					const columnWidth = `${(100 / columnCount).toFixed(3)}%`;
					const renderCell = (cellTokens: PdfInlineToken[], key: string, isHeader: boolean) => (
						<View key={key} style={[pdfStyles.tableCell, { width: columnWidth }]}>
							<Text style={isHeader ? pdfStyles.tableHeaderText : pdfStyles.tableCellText}>
								{renderPdfInlineTokens(cellTokens, key)}
							</Text>
						</View>
					);
					return (
						<View key={`table-${index}`} style={pdfStyles.table}>
							{headerCells.length > 0 ? (
								<View style={[pdfStyles.tableRow, pdfStyles.tableHeaderRow]}>
									{headerCells.map((cell, cellIndex) => renderCell(cell, `th-${index}-${cellIndex}`, true))}
								</View>
							) : null}
							{bodyRows.map((row, rowIndex) => (
								<View key={`tr-${index}-${rowIndex}`} style={pdfStyles.tableRow}>
									{Array.from({ length: columnCount }, (_, cellIndex) =>
										renderCell(row[cellIndex] ?? [], `td-${index}-${rowIndex}-${cellIndex}`, false))}
								</View>
							))}
						</View>
					);
				}
				default:
					return null;
			}
		})
		.filter((element) => element !== null);
};

function PDFReportDocument({ centerHeader, content, watermark }: {
	centerHeader?: boolean;
	content: string;
	watermark?: string | null;
}) {
	const parsed = parsePdfTokens(content);
	const elements = renderPdfContent(parsed, centerHeader);
	return (
		<Document>
			<Page size="A4" style={pdfStyles.page}>
				{watermark ? (
					<View fixed style={pdfStyles.watermark}>
						<Text style={pdfStyles.watermarkText}>{watermark}</Text>
					</View>
				) : null}
				{elements}
			</Page>
		</Document>
	);
}

/** Renders template-decorated markdown into a PDF download. */
export const generatePDFFromMarkdown = async (
	content: string,
	fileName: string,
	watermark?: string | null,
	centerHeader?: boolean,
): Promise<void> => {
	ensureFonts(content);
	const doc = <PDFReportDocument centerHeader={centerHeader} content={content} watermark={watermark} />;
	saveBlob(await pdf(doc).toBlob(), fileName, "pdf");
};
