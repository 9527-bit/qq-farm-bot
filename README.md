<div align="center">

<img src="web/public/icon.png" width="96" alt="QQ Farm Bot 图标">

# QQ Farm Bot

面向 QQ 农场小游戏的自动化托管与 Web 管理面板

[核心功能](#核心功能) · [Docker 部署](#docker-部署) · [源码运行](#源码运行) · [登录方式](#登录方式) · [常用命令](#常用命令) · [相关文档](#相关文档)

</div>

> [!WARNING]
> 本项目仅供学习与研究用途，自动化操作可能违反游戏服务条款，使用产生的封号、数据丢失及其他风险均由使用者自行承担。

## 核心功能

- **多账号与多用户管理**：支持多用户登录、卡密管理、账号权限隔离与多账号独立运行
- **全流程自动化**：覆盖农场种收、好友互动、日常任务、商城采购、牧场玩法及限时活动
- **双端协议与高并发调度**：QQ / 微信客户端版本独立维护与自动同步，支持五级网关请求调度与后台自动退让
- **多种账号登录方式**：支持内置微信扫码、可选 NapCat QQ 扫码、内置手机 MITM 抓包与手动填码
- **可视化控制面板**：基于 Vue 3 的 Web 面板，提供实时日志、农场/牧场状态、作物图鉴与数据统计
- **灵活部署**：支持 Docker Compose、宿主机源码运行及桌面二进制打包

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 后端 (`core/`) | Node.js 20+、Express、Socket.IO、Protobuf |
| 前端 (`web/`) | Vue 3、Vite、TypeScript、Pinia、UnoCSS |
| 工程与部署 | pnpm workspace、Docker Compose |

默认服务端口：`3007`（Web 管理面板）、`18000`（可选 MITM 抓包代理，默认关闭）。

## Docker 部署

```bash
git clone https://github.com/9527-bit/qq-farm-bot.git
cd qq-farm-bot
./compose.sh up -d --build
```

常用运维命令：

```bash
# 查看状态与日志
docker compose ps
docker compose logs -f qq-farm-bot

# 拉取更新并重建
git pull
./compose.sh up -d --build qq-farm-bot
```

默认端口与目录映射：

| 用途 | 端口 / 路径 |
| --- | --- |
| Web 管理面板 | `3007` |
| MITM 抓包代理（默认关闭） | `18000` |
| 持久化数据目录 | 仓库上级目录 `../data` -> 容器 `/app/core/data` |

如需自定义抓包代理对外地址，可在仓库根目录创建 `.env`：

```dotenv
CAPTURE_ADVERTISE_IPS=192.168.1.100,100.64.0.2
```

### 可选：启用 NapCat QQ 扫码

NapCat 默认不启动。如需开启 QQ 扫码登录：

```bash
cp .env.compose.example .env
```

在 `.env` 中启用配置：

```dotenv
COMPOSE_PROFILES=napcat
NAPCAT_LOGIN_ENABLED=true
```

然后执行 `./compose.sh up -d --build` 启动农场和 NapCat 服务。NapCat 数据保存在 `../data/napcat/`，默认镜像支持 `linux/amd64` 与 `linux/arm64`；如需固定设备名可设置 `NAPCAT_DEVICE_NAME`。

## 源码运行

### 环境要求

- Node.js 20+
- pnpm 10+
- Git

### 启动步骤

```bash
git clone https://github.com/9527-bit/qq-farm-bot.git
cd qq-farm-bot

corepack enable
pnpm install
pnpm build:web
pnpm dev:core
```

服务启动后访问 <http://localhost:3007>，首次登录默认凭据：

```text
用户名：admin
密码：admin
```

> [!IMPORTANT]
> 首次登录后请立即修改默认管理员密码，切勿将管理面板直接裸露到公网。升级部署时请保留原有数据目录（含 `users.json`、`cards.json`、`store.json` 等）。

如需前端热重载开发，可另开终端运行：

```bash
pnpm dev:web
```

## 登录方式

- **微信扫码**：进入「添加账号 → 微信扫码」，扫码并在应用宝授权页确认即可自动添加并启动。扫码与 MMTLS 换码链路已内置，无需额外部署第三方登录服务。
- **QQ / NapCat 扫码**：按上文启用 NapCat profile 后，在「添加账号」中通过 QQ 扫码获取登录凭证。
- **手机抓包登录**：在「系统配置 → Code/GID 抓取服务」开启服务（仅监听 `18000` 端口），按页面指引安装 CA 证书并配置 Wi-Fi 代理，重开 QQ 农场即可自动捕获 Code 与好友 GID，完成后关闭手机代理。
- **双端版本自动同步**：登录与心跳回包中的服务端强制/推荐版本会按平台分别同步到「系统配置」中的 QQ 客户端版本与微信客户端版本，互不覆盖。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev:core` | 启动后端与已构建的前端面板 |
| `pnpm dev:web` | 启动前端开发服务器 |
| `pnpm build:web` | 类型检查并构建前端生产包 |
| `pnpm lint` | 运行前后端 ESLint 检查 |
| `pnpm -C core test` | 运行后端单元测试 |
| `pnpm package:release` | 打包多平台二进制产物（输出至 `core/dist/`） |

## 项目结构

```text
qq-farm-bot/
├── core/                 # 后端服务、自动化引擎、协议与单测
│   ├── docs/             # 协议、活动与 TSDK 维护手册
│   ├── src/              # 配置、路由、模型与核心服务
│   └── test/             # 后端单元测试
├── web/                  # Vue 3 管理面板
├── napcat/               # 可选 NapCat QQ 扫码容器与插件
├── docs/                 # 兼容性与功能适配说明
├── compose.sh            # Docker Compose 启动包装脚本
├── docker-compose.yml
└── package.json
```

## 相关文档

- [牧场与活动适配说明](docs/ranch-activity-adoption.md)
- [多用户后台兼容性说明](docs/admin-compatibility-update.md)
- [限时活动适配手册](core/docs/activity-update-runbook.md)
- [TSDK / WASM 更新手册](core/docs/tsdk-update-runbook.md)
- [TSDK / ACE 运行机制](core/docs/tsdk-ace-runtime.md)

## 数据安全

`core/data/` 及 Docker 持久化目录包含账号凭证、用户数据、登录日志与统计信息，请做好备份且切勿提交到公开仓库（`.env`、运行时数据、日志及构建产物均不应入库）。
