/**
 * The console's Ant Design theme.
 *
 * Five selectable palettes: the neutral light/dark pair plus three colored
 * themes ported from the protocol-explorer project (橙色水晶 / 浅绿简约 /
 * 淡蓝粉彩, all light-based). Every palette declares its full token set, so
 * page code keeps reusing these tokens instead of hard-coding a palette.
 *
 * `cssVar` is on so custom CSS (chat transcript, terminal, plugin frames) can
 * reuse the same tokens instead of duplicating the palette.
 */

import { theme, type ThemeConfig } from "antd";
import type { ThemeMode } from "./theme-mode.ts";

/** Every neutral or tinted surface a console palette has to provide. */
interface ConsolePalette {
	sider: string;
	siderDeep: string;
	primary: string;
	primaryHover: string;
	primaryActive: string;
	success: string;
	warning: string;
	danger: string;
	contentBg: string;
	card: string;
	border: string;
	borderSoft: string;
	text: string;
	textSecondary: string;
	textTertiary: string;
	/** Faint primary-tinted washes for selected/hover states. */
	tintBg: string;
	tintBgHover: string;
	tintSelected: string;
	tintFill: string;
	/** Plain neutral washes for headers, rows and fills. */
	fillTertiary: string;
	fillQuaternary: string;
	tableHeaderBg: string;
	rowHoverBg: string;
	rowSelectedBg: string;
	rowSelectedHoverBg: string;
	/** Text drawn over the primary color. */
	onPrimary: string;
}

const FONT_FAMILY = '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif';

const LIGHT: ConsolePalette = {
	sider: "#ffffff",
	siderDeep: "#fafafa",
	primary: "#18181b",
	primaryHover: "#3f3f46",
	primaryActive: "#09090b",
	success: "#217b64",
	warning: "#946200",
	danger: "#c03f48",
	contentBg: "#fafafa",
	card: "#ffffff",
	border: "#d4d4d8",
	borderSoft: "#e4e4e7",
	text: "#18181b",
	textSecondary: "#52525b",
	textTertiary: "#71717a",
	tintBg: "#f4f4f5",
	tintBgHover: "#e4e4e7",
	tintSelected: "#f0f0f2",
	tintFill: "#f0f0f2",
	fillTertiary: "#f0f0f2",
	fillQuaternary: "#fafafa",
	tableHeaderBg: "#fafafa",
	rowHoverBg: "#fafafa",
	rowSelectedBg: "#f4f4f5",
	rowSelectedHoverBg: "#e4e4e7",
	onPrimary: "#ffffff",
};

const DARK: ConsolePalette = {
	sider: "#1b2029",
	siderDeep: "#171b22",
	primary: "#d7e0ec",
	primaryHover: "#edf2f8",
	primaryActive: "#b5c5da",
	success: "#70c7a4",
	warning: "#d9b56f",
	danger: "#ea8591",
	contentBg: "#171b22",
	card: "#202630",
	border: "#394452",
	borderSoft: "#303946",
	text: "#dce3ec",
	textSecondary: "#aab5c4",
	textTertiary: "#8693a6",
	tintBg: "#262d38",
	tintBgHover: "#343e4d",
	tintSelected: "#2a3340",
	tintFill: "#2a3340",
	fillTertiary: "#2a3340",
	fillQuaternary: "#202630",
	tableHeaderBg: "#202630",
	rowHoverBg: "#202630",
	rowSelectedBg: "#262d38",
	rowSelectedHoverBg: "#343e4d",
	onPrimary: "#171b22",
};

/** 橙色水晶 — warm orange accents on a sunlit off-white ground. */
const ORANGE: ConsolePalette = {
	sider: "#fffaf6",
	siderDeep: "#fdf1e7",
	primary: "#ea551a",
	primaryHover: "#f26f38",
	primaryActive: "#cc4412",
	success: "#0f9d58",
	warning: "#c07a00",
	danger: "#d84343",
	contentBg: "#fdf6f1",
	card: "#ffffff",
	border: "#ecd8cb",
	borderSoft: "#f5e7dc",
	text: "#46301f",
	textSecondary: "#8a6a52",
	textTertiary: "#ab8b73",
	tintBg: "#fdeee3",
	tintBgHover: "#fbdcc9",
	tintSelected: "#fbe3d2",
	tintFill: "#fbe3d2",
	fillTertiary: "#fbe3d2",
	fillQuaternary: "#fdf6f1",
	tableHeaderBg: "#fdf1e7",
	rowHoverBg: "#fdf1e7",
	rowSelectedBg: "#fdeee3",
	rowSelectedHoverBg: "#fbdcc9",
	onPrimary: "#ffffff",
};

/** 浅绿简约 — fresh green on a mint-white ground, minimal chrome. */
const MINT: ConsolePalette = {
	sider: "#f7fdf9",
	siderDeep: "#ecf9f1",
	primary: "#1c9d56",
	primaryHover: "#28b466",
	primaryActive: "#158245",
	success: "#187d4a",
	warning: "#946200",
	danger: "#c03f48",
	contentBg: "#f2fdf6",
	card: "#ffffff",
	border: "#c3e3d0",
	borderSoft: "#dff3e7",
	text: "#1a4632",
	textSecondary: "#52715f",
	textTertiary: "#7ba18c",
	tintBg: "#e4f7ec",
	tintBgHover: "#cfeedd",
	tintSelected: "#d6f2e3",
	tintFill: "#d6f2e3",
	fillTertiary: "#d6f2e3",
	fillQuaternary: "#f2fdf6",
	tableHeaderBg: "#ecf9f1",
	rowHoverBg: "#ecf9f1",
	rowSelectedBg: "#e4f7ec",
	rowSelectedHoverBg: "#cfeedd",
	onPrimary: "#ffffff",
};

/** 淡蓝粉彩 — soft pastel blue, the calmest of the three. */
const LIGHTBLUE: ConsolePalette = {
	sider: "#f8fafc",
	siderDeep: "#eff3f8",
	primary: "#5285bf",
	primaryHover: "#6d9bd0",
	primaryActive: "#43688f",
	success: "#2f7257",
	warning: "#82672b",
	danger: "#b95e65",
	contentBg: "#f4f6fb",
	card: "#ffffff",
	border: "#ccd5e5",
	borderSoft: "#e0e5ed",
	text: "#2d3e6e",
	textSecondary: "#64748f",
	textTertiary: "#8b98b0",
	tintBg: "#e8eef6",
	tintBgHover: "#d8e2ef",
	tintSelected: "#e0e8f2",
	tintFill: "#e0e8f2",
	fillTertiary: "#e0e8f2",
	fillQuaternary: "#f4f6fb",
	tableHeaderBg: "#eff3f8",
	rowHoverBg: "#eff3f8",
	rowSelectedBg: "#e8eef6",
	rowSelectedHoverBg: "#d8e2ef",
	onPrimary: "#ffffff",
};

const PALETTES: Record<ThemeMode, ConsolePalette> = {
	light: LIGHT,
	dark: DARK,
	orange: ORANGE,
	mint: MINT,
	lightblue: LIGHTBLUE,
};

function createConsoleTheme(mode: ThemeMode): ThemeConfig {
	const dark = mode === "dark";
	const colors = PALETTES[mode] ?? LIGHT;
	return {
		algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
		cssVar: { key: "cy" },
		hashed: false,
		token: {
			colorPrimary: colors.primary,
			colorTextLightSolid: colors.onPrimary,
			colorPrimaryHover: colors.primaryHover,
			colorPrimaryActive: colors.primaryActive,
			colorPrimaryBg: colors.tintBg,
			colorPrimaryBgHover: colors.tintBgHover,
			colorPrimaryBorder: dark ? "#7e8b9d" : colors.border,
			colorPrimaryText: colors.primary,
			colorInfo: colors.primary,
			colorInfoBg: colors.tintBg,
			colorInfoBorder: colors.border,
			colorInfoText: colors.primary,
			colorLink: colors.primary,
			colorLinkHover: colors.primaryHover,
			colorLinkActive: colors.primaryActive,
			controlItemBgActive: colors.tintSelected,
			controlItemBgActiveHover: colors.tintBgHover,
			colorSuccess: colors.success,
			colorSuccessBg: dark ? "#192e29" : "#edf8f3",
			colorSuccessBorder: dark ? "#315c4e" : "#c1dfd2",
			colorSuccessText: colors.success,
			colorWarning: colors.warning,
			colorWarningBg: dark ? "#30291d" : "#fff7e5",
			colorWarningBorder: dark ? "#645135" : "#ead6a9",
			colorWarningText: colors.warning,
			colorError: colors.danger,
			colorErrorBg: dark ? "#331f26" : "#fff1f2",
			colorErrorBorder: dark ? "#683641" : "#edc5ca",
			colorErrorText: colors.danger,
			colorErrorHover: dark ? "#f29aa1" : "#ad3540",
			colorBgLayout: colors.contentBg,
			colorBgContainer: colors.card,
			colorBgElevated: colors.card,
			colorBorder: colors.border,
			colorBorderSecondary: colors.borderSoft,
			colorSplit: colors.borderSoft,
			colorText: colors.text,
			colorTextSecondary: colors.textSecondary,
			colorTextTertiary: colors.textTertiary,
			colorTextQuaternary: dark ? "#7e8b9d" : colors.textTertiary,
			colorFillTertiary: colors.fillTertiary,
			colorFillQuaternary: colors.fillQuaternary,
			borderRadius: 6,
			borderRadiusLG: 10,
			borderRadiusSM: 6,
			borderRadiusXS: 4,
			controlHeight: 32,
			controlHeightSM: 26,
			controlHeightLG: 40,
			fontFamily: FONT_FAMILY,
			fontSize: 14,
			fontSizeSM: 12,
			lineHeight: 1.6,
			boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
			boxShadowSecondary: "0 12px 32px rgba(16, 24, 40, 0.12), 0 4px 12px rgba(16, 24, 40, 0.06)",
			boxShadowTertiary: "0 1px 2px rgba(16, 24, 40, 0.04)",
			motionDurationMid: "0.16s",
			wireframe: false,
		},
		components: {
			Alert: {
				defaultPadding: "6px 10px",
				withDescriptionPadding: "8px 10px",
				withDescriptionIconSize: 16,
			},
			Layout: {
				bodyBg: colors.contentBg,
				headerBg: colors.card,
				headerHeight: 48,
				headerPadding: "0 14px",
				siderBg: colors.sider,
				triggerBg: colors.siderDeep,
				triggerColor: colors.textSecondary,
				lightSiderBg: colors.sider,
				lightTriggerBg: colors.siderDeep,
				lightTriggerColor: colors.textSecondary,
			},
			Menu: {
				itemBorderRadius: 8,
				itemHeight: 34,
				itemMarginInline: 8,
				itemMarginBlock: 1,
				iconSize: 16,
				collapsedIconSize: 18,
				groupTitleColor: colors.textTertiary,
				groupTitleFontSize: 10.5,
				itemBg: "transparent",
				subMenuItemBg: "transparent",
				itemColor: colors.textSecondary,
				itemHoverBg: colors.tintBg,
				itemHoverColor: colors.text,
				itemSelectedBg: colors.tintSelected,
				itemSelectedColor: colors.text,
				itemDisabledColor: dark ? "#7e8b9d" : colors.textTertiary,
				popupBg: colors.card,
			},
			Table: {
				headerBg: colors.tableHeaderBg,
				headerColor: colors.textSecondary,
				headerSplitColor: "transparent",
				borderColor: colors.borderSoft,
				rowHoverBg: colors.rowHoverBg,
				rowSelectedBg: colors.rowSelectedBg,
				rowSelectedHoverBg: colors.rowSelectedHoverBg,
				cellFontSize: 13,
				cellFontSizeMD: 13,
				cellFontSizeSM: 13,
				cellPaddingBlock: 10,
				cellPaddingBlockMD: 10,
				cellPaddingBlockSM: 10,
				cellPaddingInline: 12,
				cellPaddingInlineMD: 12,
				cellPaddingInlineSM: 12,
				headerBorderRadius: 8,
				footerBg: "transparent",
			},
			Card: {
				headerBg: "transparent",
				headerFontSize: 14,
				bodyPadding: 16,
				headerPadding: 16,
				headerHeight: 44,
			},
			Button: {
				fontWeight: 500,
				defaultShadow: "none",
				primaryShadow: "none",
				dangerShadow: "none",
				paddingInline: 12,
			},
			Tabs: {
				horizontalItemPadding: "8px 0",
				horizontalItemGutter: 20,
				titleFontSize: 14,
			},
			Modal: {
				titleFontSize: 16,
				headerBg: colors.card,
				contentBg: colors.card,
			},
			Segmented: {
				trackBg: colors.contentBg,
				itemSelectedBg: colors.card,
			},
			Descriptions: {
				labelBg: colors.tableHeaderBg,
				titleMarginBottom: 8,
			},
			Form: {
				labelColor: colors.textSecondary,
				labelFontSize: 13,
				itemMarginBottom: 12,
				verticalLabelPadding: "0 0 6px",
			},
			Input: {
				paddingBlock: 4,
				paddingInline: 10,
			},
			Select: {
				optionSelectedBg: colors.tintBg,
			},
			Tag: {
				fontSizeSM: 12,
				defaultBg: colors.contentBg,
				defaultColor: colors.textSecondary,
			},
			Divider: {
				colorSplit: colors.borderSoft,
			},
			Drawer: {
				paddingLG: 16,
			},
			Tooltip: {
				colorBgSpotlight: dark ? "#303946" : colors.primary,
				colorTextLightSolid: "#ffffff",
			},
			Badge: {
				textFontSizeSM: 12,
			},
		},
	};
}

/** Navigation keeps its spacing while inheriting the selected palette. */
function createSidebarTheme(base: ThemeConfig): ThemeConfig {
	return {
		...base,
		cssVar: { key: "cy-sidebar" },
		components: {
			...base.components,
			Menu: {
				...base.components?.Menu,
				fontSize: 14,
				iconSize: 18,
				itemHeight: 38,
				itemPaddingInline: 16,
				itemMarginBlock: 1,
				groupTitleFontSize: 11,
			},
		},
	};
}

export const consoleThemes: Record<
	ThemeMode,
	{ main: ThemeConfig; sidebar: ThemeConfig; auth: ThemeConfig }
> = Object.fromEntries(
	(Object.keys(PALETTES) as ThemeMode[]).map((mode) => {
		const themeConfig = createConsoleTheme(mode);
		return [mode, { main: themeConfig, sidebar: createSidebarTheme(themeConfig), auth: { ...themeConfig, cssVar: { key: "cy-auth" } } }];
	}),
) as Record<ThemeMode, { main: ThemeConfig; sidebar: ThemeConfig; auth: ThemeConfig }>;
