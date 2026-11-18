/**
 * Login captcha: hand-drawn SVG with zero dependencies, mirroring the ARTEX
 * console's implementation.
 *
 * - In-memory store; each code is single-use (invalidated on first check,
 *   right or wrong) and expires after 5 minutes.
 * - The character set drops look-alikes: 0/O and 1/I/L.
 * - Comparison is case-insensitive.
 * - Visuals: bright palette, random font/rotation per glyph, decoy arcs and
 *   noise dots on a light background for readability.
 */
import { randomInt } from "node:crypto";

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_LENGTH = 4;
/** Look-alike characters (0/O, 1/I/L) are excluded. */
const CAPTCHA_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Bright, mutually distinguishable palette (readable on white). */
const CAPTCHA_COLORS = [
	"#e53935", // red
	"#fb8c00", // orange
	"#f9a825", // amber
	"#43a047", // green
	"#1e88e5", // blue
	"#8e24aa", // purple
	"#d81b60", // magenta
	"#00acc1", // cyan
];

/** Mixed typefaces make automated recognition harder. */
const CAPTCHA_FONTS = [
	"Arial, sans-serif",
	"Georgia, serif",
	"'Courier New', monospace",
	"Verdana, sans-serif",
];

interface CaptchaEntry {
	code: string;
	expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();

function genCaptchaCode(): string {
	let code = "";
	for (let i = 0; i < CAPTCHA_LENGTH; i += 1) code += CAPTCHA_CHARS[randomInt(CAPTCHA_CHARS.length)];
	return code;
}

function genCaptchaId(): string {
	return randomBytesHex(24);
}

function randomBytesHex(n: number): string {
	const hex = "0123456789abcdef";
	let out = "";
	for (let i = 0; i < n; i += 1) out += hex[randomInt(16)];
	return out;
}

/** Store a fresh code and sweep expired entries along the way. */
function putCaptcha(id: string, code: string): void {
	const now = Date.now();
	for (const [key, entry] of captchaStore) {
		if (now > entry.expiresAt) captchaStore.delete(key);
	}
	captchaStore.set(id, { code, expiresAt: now + CAPTCHA_TTL_MS });
}

/**
 * Single-use check: the id is invalidated whether the code matches or not.
 * Comparison is case-insensitive.
 */
export function verifyCaptcha(id: string, code: string): boolean {
	const trimmedId = (id ?? "").trim();
	const trimmedCode = (code ?? "").trim();
	if (!trimmedId || !trimmedCode) return false;
	const entry = captchaStore.get(trimmedId);
	captchaStore.delete(trimmedId);
	if (!entry || Date.now() > entry.expiresAt) return false;
	return trimmedCode.toLowerCase() === entry.code.toLowerCase();
}

/**
 * Draw a bright 164x46 captcha: each glyph gets a random color/font/rotation,
 * with same-palette decoy arcs and noise dots layered on top.
 */
function renderCaptchaSvg(code: string): string {
	const w = 164;
	const h = 46;
	const parts: string[] = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="验证码">`,
	);
	parts.push(`<rect width="100%" height="100%" fill="#fdfefe" rx="6"/>`);
	// Decoy arcs
	for (let i = 0; i < 4; i += 1) {
		const color = CAPTCHA_COLORS[randomInt(CAPTCHA_COLORS.length)];
		const x1 = randomInt(w / 2);
		const y1 = 4 + randomInt(h - 8);
		const x2 = w / 2 + randomInt(w / 2);
		const y2 = 4 + randomInt(h - 8);
		const cx = randomInt(w);
		const cy = randomInt(h);
		parts.push(
			`<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.45"/>`,
		);
	}
	// Glyphs
	for (let i = 0; i < code.length; i += 1) {
		const color = CAPTCHA_COLORS[randomInt(CAPTCHA_COLORS.length)];
		const font = CAPTCHA_FONTS[randomInt(CAPTCHA_FONTS.length)];
		const rot = randomInt(41) - 20; // -20..20 degrees
		const x = 12 + i * 38 + randomInt(5) - 2;
		const y = 33 + randomInt(5) - 2;
		const ch = code[i].replace("&", "&amp;").replace("<", "&lt;");
		parts.push(
			`<text x="${x}" y="${y}" font-family="${font}" font-size="30" font-weight="bold" fill="${color}" transform="rotate(${rot} ${x + 10} ${y - 12})">${ch}</text>`,
		);
	}
	// Noise dots
	for (let i = 0; i < 26; i += 1) {
		const color = CAPTCHA_COLORS[randomInt(CAPTCHA_COLORS.length)];
		parts.push(
			`<circle cx="${randomInt(w)}" cy="${randomInt(h)}" r="${1 + randomInt(2)}" fill="${color}" opacity="0.35"/>`,
		);
	}
	parts.push(`</svg>`);
	return parts.join("");
}

/** GET /api/auth/captcha — a fresh login captcha (id + SVG markup). */
export function issueCaptcha(): { id: string; svg: string } {
	const id = genCaptchaId();
	const code = genCaptchaCode();
	putCaptcha(id, code);
	return { id, svg: renderCaptchaSvg(code) };
}
