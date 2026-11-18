/**
 * The about page.
 *
 * Read-only summary of what this console is and what it is currently talking
 * to. Values come from the live snapshot, so it doubles as a diagnostics view
 * when something looks wrong.
 */

import { Alert, Descriptions, Statistic, Tag, Typography } from "antd";
import { CONSOLE_VERSION, PROJECT_NAME } from "../branding.ts";
import { t } from "../i18n.ts";
import type { CyProjectInfo, CyResolvedModelView, CyStateSnapshot, CyStatsView } from "../types.ts";
import { CY_MODE_LABELS } from "../types.ts";
import { Page } from "../ui/Page.tsx";
import { CyMark } from "./icons.tsx";
import { VersionCheck } from "./VersionCheck.tsx";

const { Text } = Typography;

export function AboutPage({
	snapshot,
	main,
	stats,
	project,
	connected,
}: {
	snapshot: CyStateSnapshot | null;
	/** What the 主模型 role resolves to. */
	main: CyResolvedModelView | null;
	stats: CyStatsView | null;
	project: CyProjectInfo | null;
	connected: boolean;
}) {
	const cumulative = stats?.cumulative;
	const items = [
		{ key: "console", label: t("控制台"), children: t("{name} Web 控制台", { name: PROJECT_NAME }) },
		{
			key: "connection",
			label: t("连接状态"),
			children: (
				<Tag color={connected ? "green" : "red"} variant="filled">
					{connected ? t("已连接") : t("已断开")}
				</Tag>
			),
		},
		{
			key: "main",
			label: t("主模型"),
			children: main
				? t("{entry}（{model}）", { entry: main.entryName, model: main.modelId })
				: <Text type="secondary">{t("未配置")}</Text>,
		},
		{
			key: "model",
			label: t("模型"),
			children: snapshot?.model ? `${snapshot.model.provider} / ${snapshot.model.id}` : <Text type="secondary">{t("未配置")}</Text>,
		},
		{ key: "mode", label: t("执行模式"), children: snapshot ? CY_MODE_LABELS[snapshot.mode] : "—" },
		{ key: "thinking", label: t("思考等级"), children: snapshot?.thinkingLevel ?? "—" },
		{
			key: "project",
			label: t("当前项目"),
			children: project
				? t("{name}（{container}）", { name: project.name, container: project.container ?? t("无容器") })
				: <Text type="secondary">{t("未选择")}</Text>,
		},
		{ key: "cwd", label: t("工作目录"), children: <Text code>{snapshot?.cwd ?? "—"}</Text> },
		{ key: "session", label: t("当前会话"), children: snapshot?.activeSessionId ?? "—" },
	];

	return (
		<Page title={t("关于")} description={t("当前运行环境与端点")} extra={<VersionCheck />}>
			<div className="about-summary">
				<div className="about-hero">
					<span className="about-hero__mark">
						<CyMark size={22} />
					</span>
					<div className="about-hero__text">
						<Text strong className="about-hero__name">
							{PROJECT_NAME}
						</Text>
						<Text type="secondary" className="about-hero__version">
							v{CONSOLE_VERSION}
						</Text>
					</div>
				</div>

				<div className="about-stats">
					<Statistic title={t("Token 输入")} value={cumulative?.tokens.input ?? "—"} groupSeparator="," />
					<Statistic title={t("Token 输出")} value={cumulative?.tokens.output ?? "—"} groupSeparator="," />
					<Statistic title={t("Token 合计")} value={cumulative?.tokens.total ?? "—"} groupSeparator="," />
					<Statistic title={t("累计花费")} value={cumulative?.cost ?? "—"} precision={4} prefix="$" />
				</div>
			</div>

			<Descriptions bordered size="small" column={{ xs: 1, sm: 1, lg: 2 }} items={items} className="about-descriptions" />

			<Alert
				type="warning"
				showIcon
				className="ui-page__alert"
				title={t("所有命令都在项目容器内以 root 执行")}
				description={t(
					"bash 命令在审批模式下逐条确认。工具输出与文件面板内容来自容器，请仅在已授权的目标上使用。",
				)}
			/>
		</Page>
	);
}
