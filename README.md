# 长缨（Changying）架构介绍与功能说明

> 基于[pi coding-agent](https://github.com/earendil-works/pi) 内核深度定制的攻防逆向等综合工具。
>
> **仅用于已获得书面授权的目标。** 自动执行模式下 Agent 可运行任意命令，使用者须自行承担操作后果。

---

## 一、系统概述

长缨(在手)是一个**授权渗透测试 Agent 工作台**：浏览器里的 Web 控制台驱动一个 AI Agent（基于 [pi coding-agent](https://github.com/earendil-works/pi) 内核），Agent 在 **Docker 容器化的 Kali 工具环境**里执行侦察、漏扫、利用、报告等测试动作。核心设计：

- **控制台与作业环境分离**：控制台是 Node 服务，所有命令都通过 `docker exec` 在项目工作容器内以 root 执行；宿主机只持久化工作目录与证据。
- **每项目一对容器**：一个工作容器 + 一个流量网关，项目之间目录、容器、会话、漏洞记录完全隔离。
- **无状态会话**：登录凭据 scrypt 哈希落盘，会话用 HMAC 签名的 Cookie（30 天/会话级），服务端无 session store。

## 二、总体架构

```
浏览器 (React 19 + Ant Design 6 + Vite)
   │  HTTPS :7777（自签证书）+ WebSocket /ws
   ▼
┌────────────────────────────────────────────────────────────┐
│  控制台容器 cy（cy-console:1.1.0，Node ≥22.19）              │
│  packages/web/dist/index.js                                 │
│   ├─ HTTP/WebSocket 服务（server.ts，单监听器，TLS 可选）     │
│   ├─ 认证层：auth.ts（scrypt + HMAC cookie）+ captcha.ts     │
│   ├─ 审批门控：review / ai(守门模型) / auto 三种模式          │
│   ├─ 会话运行时：cy-session.ts（管理 pi Agent 实例）          │
│   ├─ Docker 编排层：docker.ts（容器/镜像/构建/执行）          │
│   ├─ 流量出口：gateway.ts + singbox.ts + wireguard/openvpn   │
│   └─ 嵌入式前端资源（webui/dist gzip 后内嵌 embedded-assets） │
└──────┬──────────────────────────────┬──────────────────────┘
       │ docker.sock（宿主机守护进程）   │ docker exec
       ▼                              ▼
┌──────────────────┐        ┌──────────────────────────┐
│ cy-sb-<项目ID>    │        │ cy-<项目ID> 工作容器      │
│ 流量网关 sing-box │◄───────│ cy:latest（Kali 工具箱）  │
│ 代理/订阅/WG/OVPN │ netns  │ sleep infinity 常驻，     │
│ 出口管理          │ 共享    │ nmap/sqlmap/hydra/...    │
└──────────────────┘        └──────────────────────────┘
                                     │ -v 同路径挂载
                                     ▼
                            宿主机 /data/projects/<项目>
                            （报告、证据、文件面板数据）
```

### 1. 控制台（cy-console:1.1.0）

TypeScript monorepo（npm workspaces），控制台主体在 `packages/web`：

| 模块 | 说明 |
|---|---|
| `src/server.ts` | 单一 HTTP/HTTPS 监听器：REST API + WebSocket + 静态资源 + 入口 Gate |
| `src/auth.ts` | 单管理员账号（auth.json，0600，scrypt），会话令牌 `<expiry>.<hmac>`，登出/改密轮换签名密钥 |
| `src/captcha.ts` | 登录验证码（定制新增）：纯 Node 手绘 SVG，8 色调色板、随机字体/旋转、干扰线噪点；单次有效、5 分钟过期、不区分大小写、剔除 0/O/1/I/L |
| `src/cy-session.ts` | pi Agent 会话管理：模式切换、审批裁决、持续目标、子代理 |
| `src/docker.ts` | 容器全生命周期：`cy:latest` 工具镜像构建、工作容器创建（同路径 bind 挂载 + resolv.conf 注入）、`docker exec` 命令执行 |
| `src/gateway.ts` / `singbox.ts` | 每项目 sing-box 网关（容器 `cy-sb-<id>`，专有 `cy-proxy` 网络），Clash API 支持运行时切节点 |
| `src/approval.ts` + `src/gatekeeper.ts` | 命令审批：人工逐条 / AI 守门（ALLOW/BLOCK 判定，失败放行并记审计）/ 全自动 |
| `webui/` | React 前端（构建后 gzip 内嵌进 Node 进程，二进制/容器均单文件运行） |

### 2. 工具镜像（cy:latest）

`docker/Dockerfile` 基于 Kali rolling 构建，内含：nmap、masscan、dnsrecon、whatweb、subfinder、enum4linux、ffuf、dirsearch、wafw00f、testssl.sh、sqlmap、hashcat、john、hydra、netexec、impacket、WireGuard/OpenVPN 工具链、Chromium（发包截图）、jadx/apktool/tshark/frida（安卓分析）及凭据客户端套件。构建源（apt/pip/npm/go 镜像）可在「设置 → 环境」或 build-arg 定制，本机默认清华 HTTPS 源。

### 3. 数据与命名约定

| 项 | 值 |
|---|---|
| 控制台镜像 | `cy-console:1.1.0`（源码 `docker/Dockerfile.console` 构建） |
| 工具镜像 | `cy:latest`（源码常量 `CY_IMAGE`） |
| 工作容器 | `cy-<项目ID前12位>`，网关 `cy-sb-<同ID>`（前缀默认 `cy-`，可 `CY_CONTAINER_PREFIX` 覆盖） |
| 数据目录 | 宿主机 `/data`（**同路径绑定挂载**进容器：控制台会把 `/data` 下的 DNS 配置、项目目录作为 bind 源传给守护进程，named volume 会导致路径不一致而创建失败） |
| 账号/证书 | `/data/.cy/agent/auth.json`、`tls/cert.pem`；项目清单 `/data/.cy/agent/projects.json` |

## 三、功能清单

### 会话与 Agent
- **对话工作台**：流式回复/思考/工具过程展示，会话分支、文件面板、终端（xterm）、子代理；中英双语
- **持续目标**：目标续跑（仅自动执行 / AI 审批模式下可用），失败自动暂停
- **三种执行模式**（输入区选择，影响本会话；「设置 → 守门设置」可改全局默认）：
  - 审批：每条命令人工放行，支持前缀白名单（复合命令 `&&`/`;`/`|` 始终人工）
  - AI 审批：守门模型逐条判定 ALLOW/BLOCK，判定失败放行并记入审计页
  - 自动执行：不拦截
- **守门审计页**：AI 判定轨迹、人工放行/拦截记录、自动放行汇总

### 渗透测试能力
- **项目管理**：项目隔离工作目录/容器/会话/漏洞记录，容器可重建（数据在宿主机不丢）
- **Web 测试**：MITM 中转站、WebFuzz、发包重放（replayd + Chromium 无头渲染）、POC 订阅库（ss/vmess/vless/trojan/hysteria2/tuic 等）
- **资产测绘**：资产库与导入、协议探索
- **漏洞管理**：漏洞记录、CVSS、证据文件预览、报告中心
- **移动端**：安卓（Droid 插件：jadx/apktool/frida）、iOS 设备接入与抓包解析
- **流量出口**：SOCKS5/HTTP 代理档案、机场订阅（自动解析择优）、WireGuard 真隧道（kill-switch）、OpenVPN；切节点不重建容器
- **凭据中心**、**代码监控/复现**、**插件中心**（含 MCP 支持）、**技能（skills）体系**

### 模型管理
- 多端点模型库，按角色分配：主模型 / 守门模型 / 监督 / 命名工位等；支持 OpenAI 兼容、Anthropic 等协议；端点连通性测试

### 界面定制
- 品牌名「长缨或长缨在手」/ Changying；品牌图标 web_ui_*（favicon + 侧栏/登录/关于页）
- 5 套主题：浅色模式、夜晚模式、橙色水晶、浅绿简约、淡蓝粉彩（右上角切换，localStorage 持久化）
- 登录页：品牌主视觉 + 强制验证码；admin 菜单：修改密码（其他会话即时失效）/ 退出登录

## 四、部署与运维

```bash
# 构建镜像（源码根目录）
docker build -f docker/Dockerfile.console -t cy-console:1.1.0 .
docker build -t cy:latest --build-arg APT_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/kali docker/

# 启动（compose）
cd /root/cy && docker compose up -d     # 配置见 .env：镜像/端口/数据目录/启动参数
```

- 访问 `https://<主机>:7777`（自签 HTTPS，`--no-tls` 可关闭；`--no-gate` 关闭随机入口令牌）
- 首次进入进入,管理员admin默认密码admin@2026 删 `auth.json` 重置账号
- 控制台通过挂载的 `docker.sock` 管理宿主机 Docker：工具镜像缺失时「设置 → 环境」可一键构建
- 镜像源均为 HTTPS（清华/npmmirror/goproxy.cn），防明文劫持；构建产物在 BuildKit 缓存下可增量重建