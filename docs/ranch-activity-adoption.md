# 牧场与牧歌初启接入

初始来源固定为 `liyangpengs/qq-farm-bot@bd93d3f178413c16aebf8b34d1d85a6b2589f2c3`（2026-11-19），并于 2026-11-24 进一步跟进同步 `liyangpengs/qq-farm-bot@480e68f`（2026-11-23）的 P0/P1 能力与修复。全量保留本地多用户、账号归属、卡密、管理页面、内置抓包/NapCat 及原有活动实现。

## 2026-11-24 P0/P1 跟进增量

- **P0（双端独立版本与 QQ TSDK 修复）**：
  - 修复 `core/src/utils/tsdk-adoption-runtime.js` 中 `normalizeQqHostFeatureState()` 的 `uint8` 字节回绕问题（`((referenceValue + 1) & 0xFF)`）。
  - 新增 `core/src/utils/client-profile.js`，拆分 QQ (`clientVersion`) 与微信 (`wxClientVersion`) 独立版本号、服务端同步与前端系统配置面板，互不覆盖。
- **P1-A（五层网络并发调度与后台让路）**：
  - 升级 `request-priority.js`，新增 `request-context.js`、`low-priority-gate.js`、`request-pressure.js`，在 `network.js` 与 `scheduler.js` 落地五班次（`critical` 含 `heartbeat`/`ace` 双独立槽位、`foreground` 保底 2 槽、`farm`/`friend` 非前台限 1 槽、`background` 空闲派发与 8s 让路、4s 防饿死提升）。
- **P1-B（最新牧场特性与黑名单）**：
  - 支持普通与有机罐头分阶段使用时机（`ranch_feed_normal_stage` / `ranch_feed_organic_stage`：`any` / `longest` / `to_production` / `near_harvest`）、满桶跳过（`1003002`）与独立棚舍激活开关（`ranch_activate_shed`，默认关闭）。
  - 新增账号级 `ranchFriendBlacklist` 持久化与多用户隔离路由（`GET /api/ranch/friend-blacklist`、`POST /api/ranch/friend-blacklist/toggle`），巡查自动过滤并在服务端确认非好友（`1002002`）时持久化拉黑。
  - 补齐好友牧场可偷/可清理/可帮生产状态徽标、好友赠送牧草、背包物品锁定/解锁（`setItemLock`）、设施沙漏加速（`speedUpUpgrade`）与牧场生涯统计（`careerpb.proto` 字段 16）。

## 使用入口

- 侧栏“牧场”：动物、设施、背包、幼崽/道具商店、仓鼠集市、罐头商城、任务、图鉴和好友。
- 活动中心“牧歌初启”：庆典档位、牧友档位、成长手册与人格问卷。首次在活动中心读取服务端时间；无法确认时间时卡片禁用，不伪造活动期限。
- 设置 → 账号设置 → 日常与活动：牧场与牧歌初启各有独立卡片。新增自动化默认关闭；牧歌开关仅在有效期内显示，过期后由原有持久化清理流程关闭。
- 手工消费先读取报价，再确认；执行前重新读取状态、检查余额和限额。钻石消费由共用服务层拒绝，自动执行同样受限。
- 操作结果未知时保留资源预留记录；页面提供核对后解除预留。记录位于该实例数据目录的 `ranch-operations/`，不应通过清空目录重试消费。

## 接入结构

`admin-adoption-routes.js` 使用原有 `getAccountIdFromRequest` 和 `canAccessAccount`，再经 DataProvider/Worker 调用服务。没有引入上游的单管理员认证实现。

`utils/adoption-proto.js` 使用独立 Protobuf Root；其定义位于 `proto/adoption/`，避免覆写旧活动字段。`services/ranch/` 承载查询、交易前置检查、结果核对、待确认记录及自动化。牧歌服务为 `services/activity-muge.js`。

连接默认版本更新为 `1.17.0.4_20261117`。新版使用 PlayerLogin 后再登录农场场景，确认有效场景回包后才启动自动化。按账号平台选择版本化 QQ/WX WASM；旧 `tsdk-runtime.js` 和旧版本化 WASM 保留，没有删除。来源清单明确标注上游代码证据，未将其表述为本机官方客户端恢复或真实抓包验证。

业务任务与场景切换共用可重入串行锁。心跳、ACE、Worker 管理和停止事件不被业务锁阻塞。定时回调不会继承创建它的 HTTP 截止时间或旧锁上下文，取消的定时回调不会在队列放行后再运行。

Worker RPC 携带绝对截止时间；父进程超时发送对应取消消息。排队任务开始和发包前分别检查，避免过期任务继续发起写请求。已经发出的请求无法撤回；牧场保留结果未知记录供刷新核对。场景恢复有独立的有限清理时限，即使原操作已过期，也会尝试恢复农场；恢复失败则停止该连接。

## 数据与静态资源

- 牧场配置位于 `gameConfig/ranch/`。统一物品查询仅补充新牧场物品，原有种子、植物大小和等级例外规则保持原样。
- 素材位于 `web/public/activity/ranch/` 和 `web/public/activity/muge/`；无运行时 CDN 依赖。
- `activity-data/adoption-source-manifest.json` 记录固定来源、目标路径和摘要；`muge-assets.json` 保留对应 CDN 来源及摘要。
- `muge-activity-window.json` 是本实例运行数据，由服务端成功查询更新。无有效时间时自动任务拒绝开启，活动采用 `[startMs, endMs)`；界面按北京时间显示。

## 离线检查

```bash
pnpm -C core test
node --test web/test/*.test.cjs
pnpm -C web exec vue-tsc -b
pnpm -C web build
```

专项测试为 `core/test/adoption-runtime.test.js`、`core/test/adoption-features.test.js`、`web/test/adoption-stores.test.cjs`，覆盖账号权限、字段编码、活动边界与关闭持久化、排队超时、场景恢复、WASM 加解密、交易条件、未确认记录重载、图片摘要及账号切换迟到响应。所有游戏请求使用固定响应或替身。

## 人工验收与限制

2026-11-20，用户完成 VPS 独立测试实例验收，反馈“一切正常，验证完了”。用户提供的构建输出显示镜像构建与容器启动成功，后续状态为 `healthy`，启动日志没有报错。测试容器为 `qqfarm-validation-20261120-farm-1`，面板绑定 `127.0.0.1:9529`，使用独立测试数据卷。

本次人工验收结论依据用户反馈；未收到逐项操作记录，因此不推定所有平台、视口、付费保护或长期运行场景均已逐项验证。Codex 未直接登录真实账号或代替用户进行浏览器验收。正式 `9528` 实例的切换尚未执行。

运行时仍受上游 TSDK 宿主能力限制；离线初始化成功不能证明服务端长期接受。需要回退时应回到原分支的完整代码和对应运行环境，不混用新旧 WASM 宿主。原工作目录的 `main` 保留在本次修改前的提交，工作区内没有自动部署或真实账号消费。
