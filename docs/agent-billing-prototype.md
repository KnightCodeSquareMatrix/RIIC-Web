# Agent 计费原型

## 本地联调

1. 使用项目的迁移配置执行 `npm run db:migrate`，会安装 `drizzle/0019_agent_billing.sql`。
2. 登录管理员网站账号后打开 `/billing`。默认仅管理员可用，开放开关见 [开放策略](FEATURE_ROLLOUT.md)。
3. 配置各档位独立的爱发电商品地址：`AFDIAN_PAYMENT_URL_POINTS_1_TEST`、`AFDIAN_PAYMENT_URL_POINTS_5`、`AFDIAN_PAYMENT_URL_POINTS_10`、`AFDIAN_PAYMENT_URL_MONTHLY_19_9`。旧变量 `AFDIAN_TEST_PAYMENT_URL` 只作为 ¥5 档位的本地迁移兼容项；未配置的档位会禁用购买按钮，不会错误跳到其它金额。
4. 管理员可在本地开发环境点击“模拟爱发电回调到账”；生产环境还须设置 `BILLING_PROTOTYPE_MODE=1`。按钮和接口都受限制，公开模式不向普通用户开放此入口。
5. 在爱发电开发者后台（`https://afdian.com/dashboard/dev`）把 Webhook 地址设置为 `https://你的域名/api/billing/webhooks/afdian`。接口兼容官方 `data.order` 回调，成功响应为 `{"ec":200,"em":""}`；若配置 `AFDIAN_WEBHOOK_SECRET`，同时验证 `x-afdian-prototype-secret`。每次回调均使用 `AFDIAN_API_TOKEN` + `AFDIAN_USER_ID` 主动查询真实订单，只采用查询得到的交易号、订单关联、成功状态与金额，查询未成功不入账。

## 当前规则

- ¥1 测试包 = 10 永久积分（仅开发/原型模式显示）；¥5 = 50 永久积分；¥10 = 110 永久积分；¥19.9 = 300 月卡积分，默认 30 天有效且不结转。
- `solve_schedule` 在参数、布局和干员来源校验完成后固定扣 1 积分；余额不足在调用求解器前返回 402。该工具调用产生的 Token 费用另按实际用量计费。纯对话不收取这 1 积分，但会单独按实际 Token 用量结算。
- 钱包分为永久积分和月卡积分，扣费优先使用月卡积分。订单、回调、账本和工具扣费都使用幂等键与事务行锁。
- 永久积分可以生成 50/110 积分一次性赠送 CDK；CDK 只保存 SHA-256，生成后明文只返回一次，核销后进入接收账号永久余额。
- Agent 收尾时记录输入、输出、缓存命中 token，并按人民币计价。DeepSeek V4.1 Flash 按人民币峰谷价和缓存价计算；GLM-5.3-Flash 使用 `AGENT_GLM_INPUT_RMB_PER_MILLION`、`AGENT_GLM_CACHED_INPUT_RMB_PER_MILLION`、`AGENT_GLM_OUTPUT_RMB_PER_MILLION` 三个人民币单价配置。本站费用按上游人民币价格的 1.2 倍计入 `chargedCostRmbFen`，同时换算为积分（1 积分 = ￥0.10）。
- `solve_schedule` 的固定工具费和 Token 费用分开入账：工具费固定 1 积分，Token 费用根据实际人民币价格换算为额外积分。纯对话只有 Token 费用。若调用结束时余额不足以补扣全部 Token 费用，会保留已扣金额并将记录标为“部分费用待结算”，不会让钱包变成负数。

## 仍需上线前补齐

- 爱发电真实签名、订单退款冲正和定时 query-order 对账任务。
- 支付宝/微信适配器、退款冲正、订单过期和人工审计。
- 价格版本表与管理员发布流程；目前模型价格代码用于原型验证，历史调用的价格快照应迁入数据库。
- Agent 多轮预扣/结算、并发预算和模型 token 费用入账策略。目前已接入单次工具调用的收尾结算；多工具、多轮调用仍应在上线前增加统一预算与欠费追缴策略。
