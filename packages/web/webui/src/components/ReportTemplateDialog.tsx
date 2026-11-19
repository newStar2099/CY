/** Report template settings dialog: create, edit, activate and delete
 * appearance templates applied to MD/HTML/PDF/DOCX exports. */
import { DeleteOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, List, Modal, Space, Switch, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportTemplateRecord } from "../../../src/report-types.ts";
import { getLanguage } from "../i18n.ts";
import {
	ACTIVE_TEMPLATE_EVENT,
	deleteReportTemplate,
	getActiveTemplateId,
	listReportTemplates,
	saveReportTemplate,
	setActiveTemplateId,
	type ReportTemplatePatch,
} from "../report-template.ts";

const tx = (zh: string, en: string) => (getLanguage() === "en" ? en : zh);

// Logos are embedded in every exported report, so keep them small. A 2 MB
// image becomes a ~2.8 MB data URL, which fits the backend's 3 MB logo limit.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface LogoValue {
	dataUrl: string;
	height: number;
	width: number;
}

function readLogoFile(file: File): Promise<LogoValue> {
	return new Promise((resolve, reject) => {
		if (file.size > MAX_LOGO_BYTES) {
			reject(new Error(tx("Logo 文件过大（最大 2 MB）", "Logo file is too large (max 2 MB)")));
			return;
		}
		if (!file.type.startsWith("image/")) {
			reject(new Error(tx("Logo 必须是图片文件", "Logo must be an image file")));
			return;
		}
		// SVG is intentionally rejected: PDF/DOCX embedding is unreliable without
		// a raster fallback.
		if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
			reject(new Error(tx("不支持 SVG Logo", "SVG logos are not supported")));
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result !== "string") {
				reject(new Error(tx("Logo 文件读取失败", "Failed to read logo file")));
				return;
			}
			const image = new window.Image();
			image.onload = () => resolve({ dataUrl: reader.result as string, height: image.naturalHeight, width: image.naturalWidth });
			image.onerror = () => reject(new Error(tx("Logo 文件读取失败", "Failed to read logo file")));
			image.src = reader.result;
		};
		reader.onerror = () => reject(new Error(tx("Logo 文件读取失败", "Failed to read logo file")));
		reader.readAsDataURL(file);
	});
}

interface TemplateFormValues {
	name: string;
	title: string;
	reviewer: string;
	showDate: boolean;
	watermarkEnabled: boolean;
	watermarkText: string;
}

export function ReportTemplateDialog({ open, onClosed }: { open: boolean; onClosed: () => void }) {
	const { message } = App.useApp();
	const [templates, setTemplates] = useState<ReportTemplateRecord[]>([]);
	const [activeId, setActiveId] = useState<number | null>(null);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [saving, setSaving] = useState(false);
	const [logo, setLogo] = useState<LogoValue | null>(null);
	const [form] = Form.useForm<TemplateFormValues>();
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const refresh = useCallback(async () => {
		setTemplates(await listReportTemplates());
		setActiveId(getActiveTemplateId());
	}, []);

	useEffect(() => {
		if (!open) return;
		void refresh().catch((failure: unknown) => void message.error(failure instanceof Error ? failure.message : String(failure)));
		const reload = () => void refresh().catch(() => undefined);
		window.addEventListener(ACTIVE_TEMPLATE_EVENT, reload);
		return () => window.removeEventListener(ACTIVE_TEMPLATE_EVENT, reload);
	}, [open, refresh, message]);

	const resetForm = () => {
		setEditingId(null);
		setLogo(null);
		form.resetFields();
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	const handleLogoChange = async (file: File) => {
		try {
			setLogo(await readLogoFile(file));
		} catch (failure) {
			void message.error(failure instanceof Error ? failure.message : String(failure));
		}
		return false;
	};

	const handleSave = async () => {
		try {
			const values = await form.validateFields();
			setSaving(true);
			const patch: ReportTemplatePatch = {
				logo: logo?.dataUrl ?? "",
				logoHeight: logo?.height ?? 0,
				logoWidth: logo?.width ?? 0,
				name: values.name.trim(),
				reviewer: values.reviewer?.trim() ?? "",
				showDate: values.showDate,
				title: values.title?.trim() ?? "",
				watermarkEnabled: values.watermarkEnabled,
				watermarkText: values.watermarkText?.trim() ?? "",
			};
			const saved = await saveReportTemplate(patch, editingId ?? undefined);
			if (saved) {
				void message.success(tx("报告模板已保存", "Report template saved"));
				await refresh();
				setActiveTemplateId(saved.id);
				setActiveId(saved.id);
				resetForm();
			} else {
				void message.error(tx("报告模板保存失败", "Failed to save report template"));
			}
		} catch (failure) {
			if (failure instanceof Error) void message.error(failure.message);
		} finally {
			setSaving(false);
		}
	};

	const handleEdit = (template: ReportTemplateRecord) => {
		setEditingId(template.id);
		setLogo(template.logo ? { dataUrl: template.logo, height: template.logoHeight, width: template.logoWidth } : null);
		form.setFieldsValue({
			name: template.name,
			title: template.title,
			reviewer: template.reviewer,
			showDate: template.showDate,
			watermarkEnabled: template.watermarkEnabled,
			watermarkText: template.watermarkText,
		});
	};

	const handleDelete = async (template: ReportTemplateRecord) => {
		try {
			const ok = await deleteReportTemplate(template.id);
			if (!ok) {
				void message.error(tx("报告模板删除失败", "Failed to delete report template"));
				return;
			}
			if (activeId === template.id) {
				setActiveTemplateId(null);
				setActiveId(null);
			}
			if (editingId === template.id) resetForm();
			void message.success(tx("报告模板已删除", "Report template deleted"));
			await refresh();
		} catch (failure) {
			void message.error(failure instanceof Error ? failure.message : String(failure));
		}
	};

	const handleActivate = (template: ReportTemplateRecord, checked: boolean) => {
		const next = checked ? template.id : null;
		setActiveTemplateId(next);
		setActiveId(next);
	};

	return (
		<Modal
			cancelText={tx("关闭", "Close")}
			footer={[
				<Button key="close" onClick={() => { resetForm(); onClosed(); }}>{tx("关闭", "Close")}</Button>,
				<Button key="save" loading={saving} onClick={() => void handleSave()} type="primary">{tx("保存模板", "Save template")}</Button>,
			]}
			onCancel={() => { resetForm(); onClosed(); }}
			open={open}
			styles={{ body: { maxHeight: "65vh", overflowY: "auto" } }}
			title={tx("报告模板设置", "Report template settings")}
			width={640}
		>
			<Form form={form} initialValues={{ name: "", reviewer: "", showDate: true, title: "", watermarkEnabled: false, watermarkText: "" }} layout="vertical">
				<Form.Item label={tx("模板名称", "Template name")} name="name" rules={[{ max: 100, message: tx("最多 100 个字符", "At most 100 characters") }, { required: true, message: tx("请填写模板名称", "Template name is required") }]}>
					<Input maxLength={100} placeholder={tx("例如：渗透测试报告", "e.g. Penetration test report")} />
				</Form.Item>
				<Form.Item extra={tx("留空则使用报告原标题", "Leave empty to use the report title")} label={tx("报告标题", "Report title")} name="title" rules={[{ max: 200, message: tx("最多 200 个字符", "At most 200 characters") }]}>
					<Input maxLength={200} placeholder={tx("自定义报告标题", "Custom report title")} />
				</Form.Item>
				<Space size={16} align="start" wrap>
					<Form.Item label={tx("审阅人", "Reviewer")} name="reviewer" rules={[{ max: 100, message: tx("最多 100 个字符", "At most 100 characters") }]}>
						<Input maxLength={100} placeholder={tx("审阅人姓名", "Reviewer name")} style={{ width: 220 }} />
					</Form.Item>
					<Form.Item label={tx("显示报告日期", "Show generation date")} name="showDate" valuePropName="checked">
						<Switch />
					</Form.Item>
				</Space>
				<Form.Item label={tx("Logo", "Logo")}>
					<Space size={12} wrap>
						<input accept="image/png,image/jpeg,image/gif,image/bmp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleLogoChange(file); }} ref={fileInputRef} type="file" />
						<Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>{tx("上传 Logo", "Upload logo")}</Button>
						{logo ? <img alt={tx("Logo 预览", "Logo preview")} src={logo.dataUrl} style={{ border: "1px solid #e2e8f0", borderRadius: 4, height: 48, maxWidth: 160, objectFit: "contain" }} /> : null}
						{logo ? <Button onClick={() => { setLogo(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} size="small">{tx("移除", "Remove")}</Button> : null}
					</Space>
					<Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
						{tx("嵌入导出报告顶部，最大 2 MB，不支持 SVG。", "Embedded at the top of exports. Max 2 MB. SVG is not supported.")}
					</Typography.Text>
				</Form.Item>
				<Form.Item label={tx("水印", "Watermark")} name="watermarkEnabled" valuePropName="checked">
					<Switch />
				</Form.Item>
				<Form.Item dependencies={["watermarkEnabled"]} noStyle>
					{({ getFieldValue }) => (
						<Form.Item label={tx("水印文字", "Watermark text")} name="watermarkText" rules={[{ max: 200, message: tx("最多 200 个字符", "At most 200 characters") }]}>
							<Input disabled={!getFieldValue("watermarkEnabled")} maxLength={200} placeholder={tx("自定义水印文字", "Custom watermark text")} />
						</Form.Item>
					)}
				</Form.Item>
				<Typography.Text type="secondary">
					{tx("水印渲染进 PDF 与 DOCX 导出，由当前时间与自定义文字组成。", "Rendered into PDF and DOCX exports from the generation time and the custom text.")}
				</Typography.Text>
			</Form>
			{templates.length > 0 ? (
				<div style={{ marginTop: 16 }}>
					<Typography.Text strong>{tx("已保存模板", "Saved templates")}</Typography.Text>
					<List
						dataSource={templates}
						renderItem={(template) => (
						<List.Item
							actions={[
								<Button icon={<EditOutlined />} key="edit" onClick={() => handleEdit(template)} size="small">{tx("编辑", "Edit")}</Button>,
								<Button danger icon={<DeleteOutlined />} key="delete" onClick={() => void handleDelete(template)} size="small" type="text" />,
							]}
						>
							<Space size={10}>
								<Switch checked={activeId === template.id} checkedChildren={tx("启用", "On")} onChange={(checked) => handleActivate(template, checked)} unCheckedChildren={tx("停用", "Off")} />
								<div>
									<Typography.Text strong>{template.name}</Typography.Text>
									<Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
										{template.title || tx("未设置标题", "No custom title")}
										{template.reviewer ? ` · ${template.reviewer}` : ""}
										{template.logo ? ` · ${tx("含 Logo", "Logo")}` : ""}
										{template.watermarkEnabled ? ` · ${tx("水印", "Watermark")}` : ""}
									</Typography.Text>
								</div>
							</Space>
						</List.Item>
					 )}
					 size="small"
					/>
					<Typography.Text type="secondary">
						{tx("开启一个模板后，报告导出（HTML/PDF/DOCX）将自动应用它的页眉与水印。", "Toggle a template on to apply its header and watermark to report exports (HTML/PDF/DOCX).")}
					</Typography.Text>
				</div>
			) : null}
		</Modal>
	);
}
