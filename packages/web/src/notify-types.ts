/** Notification settings shared by the server and browser. Groups apply globally. */
export type CyNotifyChannel = "dingtalk" | "feishu" | "wecom";
export type CyNotifyKind = "runs" | "vulns" | "codeIntel" | "goals" | "engines" | "pocs";
export type CyNotifyKinds = Record<CyNotifyKind, boolean>;

export interface CyNotifyChannelConfig {
	enabled: boolean;
	webhook: string;
	secret: string;
	keyword: string;
}

export interface CyNotifyTarget extends CyNotifyChannelConfig {
	id: string;
	name: string;
	channel: CyNotifyChannel;
}

export interface CyNotifyGroup {
	id: string;
	name: string;
	enabled: boolean;
	kinds: CyNotifyKinds;
	targets: CyNotifyTarget[];
}

export interface CyNotifyConfig {
	groups: CyNotifyGroup[];
	/** Characters kept per body section; 0 keeps all, subject to platform limits. */
	summaryLimit: number;
}

export interface CyNotifyDelivery {
	groupId: string;
	groupName: string;
	targetId: string;
	targetName: string;
	channel: CyNotifyChannel;
	ok: boolean;
	error?: string;
}

export interface CyNotifyStatus {
	at: number | null;
	ok: boolean;
	error?: string;
	subject?: string;
	deliveries?: CyNotifyDelivery[];
}
