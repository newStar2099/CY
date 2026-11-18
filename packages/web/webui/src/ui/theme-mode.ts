import { useSyncExternalStore } from "react";

/**
 * Selectable console themes: the neutral light/dark pair plus the three
 * palettes ported from the protocol-explorer project. Only "dark" flips the
 * Ant Design algorithm; the colored ones stay light-based.
 */
export type ThemeMode = "light" | "dark" | "orange" | "mint" | "lightblue";

const THEME_IDS: readonly ThemeMode[] = ["light", "dark", "orange", "mint", "lightblue"];
const STORAGE_KEY = "cy.ui.theme";
const listeners = new Set<() => void>();

/** Chinese source labels; English comes from the EN_MESSAGES dictionary. */
export const THEME_LABELS: Record<ThemeMode, string> = {
	light: "浅色模式",
	dark: "夜晚模式",
	orange: "橙色水晶",
	mint: "浅绿简约",
	lightblue: "淡蓝粉彩",
};

export const THEME_OPTIONS: readonly ThemeMode[] = THEME_IDS;

function readThemeMode(): ThemeMode {
	try {
		const stored = globalThis.localStorage?.getItem(STORAGE_KEY) as ThemeMode | null;
		return stored && THEME_IDS.includes(stored) ? stored : "light";
	} catch {
		return "light";
	}
}

let mode = readThemeMode();

function applyThemeMode(): void {
	if (typeof document === "undefined") return;
	document.documentElement.dataset.theme = mode;
	document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
}

applyThemeMode();

export function getThemeMode(): ThemeMode {
	return mode;
}

export function setThemeMode(next: ThemeMode): void {
	mode = next;
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, next);
	} catch {
		// The current page can still switch when browser storage is unavailable.
	}
	applyThemeMode();
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.storageArea !== window.localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
		mode = readThemeMode();
		applyThemeMode();
		for (const listener of listeners) listener();
	});
}

export function useThemeMode(): ThemeMode {
	return useSyncExternalStore(subscribe, getThemeMode, getThemeMode);
}
