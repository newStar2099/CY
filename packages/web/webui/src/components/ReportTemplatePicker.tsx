/** Small template-selection dialog: choosing the template applied to report
 * exports opens here first; the full editor is reachable via a link, mirroring
 * the upstream reports page interaction. */
import { App, Button, Modal, Select, Space, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { ReportTemplateRecord } from "../../../src/report-types.ts";
import { getLanguage } from "../i18n.ts";
import {
	getActiveTemplateId,
	listReportTemplates,
	setActiveTemplateId,
} from "../report-template.ts";

const tx = (zh: string, en: string) => (getLanguage() === "en" ? en : zh);

export function ReportTemplatePicker({ open, onClosed, onManage }: {
	open: boolean;
	onClosed: () => void;
	/** Opens the full editor; the picker closes first (nested modals misroute
	 * dismiss/focus events), and the caller reopens the picker afterwards. */
	onManage: () => void;
}) {
	const { message } = App.useApp();
	const [templates, setTemplates] = useState<ReportTemplateRecord[]>([]);
	const [selection, setSelection] = useState<string>("default");

	const load = useCallback(async () => {
		const list = await listReportTemplates();
		setTemplates(list);
		// Preselect the active template when it still exists, else the first
		// template (so the dropdown is never blank while templates exist),
		// else the system default.
		const activeId = getActiveTemplateId();
		setSelection((current) => {
			if (current !== "default" && list.some((template) => String(template.id) === current)) return current;
			if (activeId !== null && list.some((template) => template.id === activeId)) return String(activeId);
			return list[0] ? String(list[0].id) : "default";
		});
	}, []);

	useEffect(() => {
		if (!open) return;
		void load().catch((failure: unknown) => void message.error(failure instanceof Error ? failure.message : String(failure)));
	}, [open, load, message]);

	const persist = () => {
		setActiveTemplateId(selection === "default" ? null : Number(selection));
		onClosed();
	};

	return (
		<Modal
			cancelText={tx("取消", "Cancel")}
			okButtonProps={{ disabled: selection !== "default" && !templates.some((template) => String(template.id) === selection) }}
			okText={tx("使用该模板", "Use this template")}
			onCancel={onClosed}
			onOk={persist}
			open={open}
			title={tx("报告模板", "Report template")}
			width={480}
		>
			<Space direction="vertical" size={12} style={{ width: "100%" }}>
				<Typography.Text type="secondary">
					{tx("选择导出报告应用的模板；未启用或模板无自定义内容时使用系统默认格式。也可以 ", "Pick the template applied to report exports; without one the system default format is used. You can also ")}
					<Button
						onClick={onManage}
						size="small"
						type="link"
						// 底色/边框突出这是个可点击入口，纯文字链接容易被当成普通说明。
						style={{ background: "#f6ffed", borderColor: "#b7eb8f", borderRadius: 4 }}
					>
						{tx("新建或管理模板", "create or manage templates")}
					</Button>
				</Typography.Text>
				<div>
					<Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
						{tx("当前报告模板", "Current report template")}
					</Typography.Text>
					<Select
						onChange={(value) => setSelection(value)}
						options={[{ value: "default", label: tx("系统默认格式", "System default format") }, ...templates.map((template) => ({ value: String(template.id), label: `${template.name}${template.reviewer ? ` · ${template.reviewer}` : ""}` }))]}
						style={{ width: "100%" }}
						value={selection}
					/>
				</div>
			</Space>
		</Modal>
	);
}
