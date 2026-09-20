# Agent 探索原型（可露希尔助理）

实验性的 agent 入口：把站内既有功能工具化，让大模型以"可露希尔"人格在对话中编排账号诊断、排班求解、技能查询与知识库检索，输出整体方案。本文记录架构、配置与后续路线。

## 架构

```
/agent 聊天页面（src/app/agent/page.tsx + src/components/agent/AgentChat.tsx）
  useChat + DefaultChatTransport，工具调用渲染为站内卡片
        ↕ SSE（UIMessage 流）
/api/agent/chat（src/app/api/agent/chat/route.ts）
  better-auth 会话校验 → 系统提示词 → streamText 工具循环（stopWhen 12 步）
        ↓ 服务端进程内直调（传 userId，不透传任何凭证给模型）
工具层（src/server/agent/tools.ts，Zod inputSchema）
  diagnose_account / solve_schedule / query_skills / kb_route / kb_read
        ↓
站内既有服务：skland adapter、runPlan 求解器、arkntools 技能目录、RIIC-knowledge 文件库
```

分层文件：

| 文件 | 职责 |
|---|---|
| `src/server/agent/config.ts` | AGENT_* 环境变量（provider 预设 deepseek/glm、base URL、model、key、知识库路径） |
| `src/server/agent/llm.ts` | `@ai-sdk/openai-compatible` provider 工厂，两家厂商同一通道 |
| `src/server/agent/persona.ts` | 人格（person-card/closure.md 内嵌）+ 工具使用守则与搓玉工作流剧本 |
| `src/server/agent/knowledge.ts` | 知识库访问器：标题清单索引检索、正文读取（路径白名单防越界，16K 截断） |
| `src/server/agent/tools.ts` | 5 个工具定义、结果投影、审计日志 |

## 工具清单

| 工具 | 数据源 | 说明 |
|---|---|---|
| `diagnose_account` | `readSklandAccountStore` + `loadStatusSnapshot` + `listSavedPlans` | 森空岛绑定/玩家信息/库存练度统计/当前基建/最近排班 |
| `solve_schedule` | `buildBlueprint`/`updateFactoryRecipe` + `runPlan`/`getSampleOperbox` + `toPublicPlanData` | 真实求解：布局预设、box 来源、换班节奏、制造站配方（搓玉配 originium）；返回排班、日产出、练卡建议 |
| `query_skills` | `src/generated/arkntools/building-skill-catalog.json` | 技能名/关键词/标签查询，富文本标记清洗 |
| `kb_route` | `RIIC-knowledge/index/标题清单.md` | 关键词→候选文档路径（2-gram 匹配扩大召回） |
| `kb_read` | `RIIC-knowledge/docs/**` | 读正文，仅限知识库目录内 .md |

## 配置

`riicweb/.env.local`：

```
AGENT_LLM_PROVIDER=deepseek   # 或 glm
AGENT_LLM_API_KEY=<真实密钥>
# 可选：AGENT_LLM_BASE_URL / AGENT_LLM_MODEL 覆盖预设
AGENT_KB_DIR=E:/arknights-infra-project/RIIC-knowledge
```

填好 key 重启 dev 服务后访问 `/agent`。key 未配置时页面显示填写引导，站点其他功能不受影响。

## 安全模型

- 工具全部在服务端进程内以用户身份执行，模型只见工具名与 JSON 参数，接触不到 session、森空岛凭证或数据库连接。
- `solve_schedule` 是唯一消耗类工具：人格守则要求调用前向用户确认布局与 box 来源。
- 每次工具调用输出结构化审计日志（`agent_tool_call`：userId、工具名、参数摘要、耗时、成败）。
- 知识库读取做了路径越界防护。

## 搓玉场景（验收路径）

用户："我想搓玉，不知道怎么搞" →

1. agent 追问需求与 box 来源（人格守则第 1 条）；
2. `diagnose_account`：森空岛库存/练度概览；
3. `kb_route`+`kb_read`：《搓玉》《产出常数表》《高效率散件》等，取搓玉线取舍、无人机折算、换算常数；
4. 确认后 `solve_schedule`（243 布局，制造站配方 `["originium","originium","gold","gold"]`）；
5. 汇总：排班表（卡片渲染）+ 日产出 + 练卡建议 + 知识库解释（标注出处）。

## 已验证 / 待验证

已验证：TypeScript 与 eslint 通过；知识库检索精准命中搓玉相关文档且路径越界被拦截；`/agent` 页面渲染；未登录 POST 返回 AIC-AUTH-2008；`runPlan` 求解链路回归（243+示例 Box，3 班，约 4.5 秒）。

待验证（需填入真实 API key）：多轮对话、工具编排正确性、搓玉场景全链路对话。

## 结果验收链路（方案 1+2，已实现）

- `solve_schedule` 求解成功后把精简投影落库到 `app.agent_plan_artifact`（7 天 TTL，跨用户读取被拒绝），工具返回 `planUrl = /plan/<id>`。
- 只读结果页 `src/app/plan/[id]/page.tsx`：按登录用户鉴权读取，复用站内视觉渲染完整排班（含**班次切换按钮**、产出摘要、练卡建议折叠区）。
- 聊天卡片同步升级：摘要行 + "打开排班结果页验收"按钮 + 折叠的班次切换完整视图（与结果页共用 `PlanArtifactView` 组件）。
- 人格守则要求 agent 求解后把 `planUrl` 告诉用户并提醒验收。

## 页面实时刷新（方案 4，调研结论）

目标：用户开着的页面自动感知 agent 产出的新结果。可选路径：

1. **BroadcastChannel（同浏览器，推荐第一步）**：聊天页在 solve 工具完成后 `postMessage({ type: "plan-ready", planUrl })`；工作台页监听同一 channel，弹提示条"可露希尔生成了新排班 → 查看"。零后端改动、毫秒级；限制是仅同一浏览器的标签页之间。
2. **PostgreSQL NOTIFY → SSE（正式跨端方案）**：站内已有 LISTEN/NOTIFY 设施（plan worker 唤醒机制）与常驻进程部署（systemd standalone），可直接复用。agent 落库后 `NOTIFY agent_plan`；新增 `GET /api/agent/events` SSE 端点：per-connection LISTEN、按 userId 过滤（通知 payload 只带 artifact id，客户端收到后再拉取鉴权资源）；工作台用 `EventSource` 订阅，断线自动重连。需要处理连接注册表、25s 心跳注释行防代理超时、dev HMR 下的连接重置（生产无碍）。
3. **轮询兜底**：页面 15–30s `GET /api/agent/plan/latest`（ETag/304），十余行实现，作为 SSE 的降级。
4. WebSocket 不建议：单向通知场景 SSE 足够，custom server 注入 ws 会增加部署复杂度。

推荐演进顺序：先 1（覆盖当前"同一浏览器边聊边看"的实际用法），需要跨设备时上 2+3。

## 二期路线（工程化调研结论）

1. **会话持久化**：参照 Vercel ai-chatbot 的 Drizzle 会话表设计，聊天历史落库。
2. **工具审批**：AI SDK `toolApproval`，把 solve 等消耗类工具升级为显式人工确认。
3. **MCP 外部化**：用 `@modelcontextprotocol/server` v2 把同一批 Zod 工具挂成 Streamable HTTP MCP server（OAuth 2.1 Resource Server），让用户在 Claude/Cursor 等客户端查询自己的基建数据；内部工具定义与 MCP schema 共享。
4. **知识库检索增强**：接入 RIIC-knowledge 自带的导诊表路由与消歧字典做俗称归一；长文档做小节级定位。
5. **观测**：工具调用审计日志接入管理端指标（复用 plan-run/solver-metrics 模式）。

主要参考：Vercel AI SDK v7（tool loop / UIMessage parts）、assistant-ui（可替换的聊天 UI 层）、Vercel ai-chatbot（会话持久化与 artifacts 模式）、MCP 2025-11/2026-07 规范（Streamable HTTP、OAuth 2.1、异步 Tasks）。

## 维护备注

- 人格卡内容以 `E:\arknights-infra-project\person-card\closure.md` 为真源，当前内嵌于 `persona.ts`；上游改动后需手动同步。
- 知识库是仓库外本地目录，生产部署前需同步该目录或打包索引。
- `scripts/agent-knowledge-smoke.mts` 是知识库工具的冒烟脚本（需在 node_modules/server-only 空桩存在时运行，仅本地诊断用）。
