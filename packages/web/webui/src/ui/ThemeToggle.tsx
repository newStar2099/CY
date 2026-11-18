import { CheckOutlined, DownOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Button, Dropdown, Tooltip } from "antd";
import { t } from "../i18n.ts";
import { setThemeMode, THEME_LABELS, THEME_OPTIONS, useThemeMode, type ThemeMode } from "./theme-mode.ts";

/** A small color dot for the three colored themes. */
const THEME_SWATCH: Partial<Record<ThemeMode, string>> = {
	orange: "#ea551a",
	mint: "#1c9d56",
	lightblue: "#5285bf",
};

function themeIcon(mode: ThemeMode) {
	if (mode === "dark") return <MoonOutlined />;
	if (mode === "light") return <SunOutlined />;
	const color = THEME_SWATCH[mode];
	return <span className="theme-dot" style={{ background: color, borderColor: color }} />;
}

export function ThemeToggle() {
	const current = useThemeMode();
	return (
		<Dropdown
			trigger={["click"]}
			menu={{
				selectedKeys: [current],
				items: THEME_OPTIONS.map((mode) => ({
					key: mode,
					icon: themeIcon(mode),
					label: t(THEME_LABELS[mode]),
					...(mode === current ? { extra: <CheckOutlined /> } : {}),
				})),
				onClick: ({ key }) => setThemeMode(key as ThemeMode),
			}}
		>
			<Tooltip title={t("主题")}>
				<Button
					type="text"
					icon={
						<span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
							{themeIcon(current)}
							<DownOutlined style={{ fontSize: 10 }} />
						</span>
					}
					aria-label={t("主题")}
				/>
			</Tooltip>
		</Dropdown>
	);
}
