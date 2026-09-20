# Agent 探索原型（可露希尔助理）

实验性的 agent 入口：把站内既有功能工具化，让大模型在对话中编排账号诊断、排班求解、技能查询与知识库检索，输出整体方案。本文记录架构、配置与后续路线。

## 仓库边界（重要）

本仓库（RIIC-Web）只包含 agent 的**编排代码与工具定义**。运行时依赖的两类外部内容不随本仓库分发：

| 内容 | 位置 | 接入方式 |
|---|---|---|
| 基建知识库 | 外部仓库 [RIIC-knowledge](https://github.com/lejciy/RIIC-knowledge)（markdown 语料 + 索引） | 克隆到本地后，用 `AGENT_KB_DIR` 指向仓库根目录；`kb_route`/`kb_read` 工具按需读取 |
| 人格卡 | 独立的 person-card 仓库（不公开分发） | 克隆后用 `AGENT_PERSONA_CARD` 指向卡片文件（如 closure.md）；未配置时自动回退为中性的助理语气 |

模型接入（DeepSeek / GLM，OpenAI 或 Anthropic 兼容协议）通过 `AGENT_LLM_*` 环境变量配置，密钥只存在于本地 `.env.local`。

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

## 结果验收链路（工作台注入为主，已实现）

核心思路：agent 的排班结果不另起炉灶，而是**注入现有工作台**，班次切换、手动排班导入、效率视图等全部现有功能即刻可用。

- `solve_schedule` 求解后把「精简投影 + 完整工作台会话（完整求解结果、布局、box、换班参数）」落库 `app.agent_plan_artifact`（7 天 TTL，仅本人可读，v2 结构）。
- 交接通道（`src/agent-artifact-bridge.ts`）：
  - **跨页面**：聊天卡片"在工作台中打开"→ sessionStorage 交接 + 跳转 `/` → 工作台启动时自动注入；
  - **同浏览器已开标签**：聊天页在求解完成时经 `BroadcastChannel("riic-agent")` 广播 → 工作台顶部横幅提示，一键注入。
- 注入实现（`App.tsx` 的 `applyAgentArtifact`）：拉取 `GET /api/agent/plan/<id>`（登录鉴权）后复用会话恢复路径（同 `loadPersistedSession`）设置 preset/layout/operbox/boxSource/rotation/fiammetta/result/activeShift 全部状态，并自动切到计算器页；注入结果经既有持久化机制写入 localStorage，刷新不丢。
- `/plan/<id>` 只读结果页保留作为轻量查看/分享入口（含班次切换），不再是主路径。
- 主动覆盖保护：广播路径只弹横幅不自动注入（避免覆盖正在编辑的状态）；聊天页点击"在工作台中打开"视为明确意图，自动注入。

## 页面实时刷新（方案 4，演进路线）

已落地：BroadcastChannel 同浏览器通知 + sessionStorage 跨页交接（见上）。后续：

1. **PostgreSQL NOTIFY → SSE（正式跨端方案）**：站内已有 LISTEN/NOTIFY 设施（plan worker 唤醒机制）与常驻进程部署（systemd standalone），可直接复用。agent 落库后 `NOTIFY agent_plan`；新增 `GET /api/agent/events` SSE 端点：per-connection LISTEN、按 userId 过滤（通知 payload 只带 artifact id，客户端收到后再拉取鉴权资源）；工作台用 `EventSource` 订阅，断线自动重连。需要处理连接注册表、25s 心跳注释行防代理超时、dev HMR 下的连接重置（生产无碍）。接入点已预留：把横幅的数据源从 BroadcastChannel 扩展为 BroadcastChannel + SSE 双通道即可。
2. **轮询兜底**：页面 15–30s `GET /api/agent/plan/latest`（ETag/304），作为 SSE 的降级。
3. WebSocket 不建议：单向通知场景 SSE 足够，custom server 注入 ws 会增加部署复杂度。

## 二期路线（工程化调研结论）

1. **会话持久化**：参照 Vercel ai-chatbot 的 Drizzle 会话表设计，聊天历史落库。
2. **工具审批**：AI SDK `toolApproval`，把 solve 等消耗类工具升级为显式人工确认。
3. **MCP 外部化**：用 `@modelcontextprotocol/server` v2 把同一批 Zod 工具挂成 Streamable HTTP MCP server（OAuth 2.1 Resource Server），让用户在 Claude/Cursor 等客户端查询自己的基建数据；内部工具定义与 MCP schema 共享。
4. **知识库检索增强**：接入 RIIC-knowledge 自带的导诊表路由与消歧字典做俗称归一；长文档做小节级定位。
5. **观测**：工具调用审计日志接入管理端指标（复用 plan-run/solver-metrics 模式）。

主要参考：Vercel AI SDK v7（tool loop / UIMessage parts）、assistant-ui（可替换的聊天 UI 层）、Vercel ai-chatbot（会话持久化与 artifacts 模式）、MCP 2025-11/2026-07 规范（Streamable HTTP、OAuth 2.1、异步 Tasks）。

## 维护备注

- 人格卡内容存放于独立的 person-card 外部仓库（不随本仓库分发），以 `AGENT_PERSONA_CARD` 指向的本地文件为真源；上游改动后同步该文件即可（60 秒缓存）。
- 知识库是外部仓库 [RIIC-knowledge](https://github.com/lejciy/RIIC-knowledge)，以 `AGENT_KB_DIR` 指向本地克隆；部署环境需要各自克隆并配置路径。
- `scripts/agent-knowledge-smoke.mts` 是知识库工具的冒烟脚本（需配置 AGENT_KB_DIR，仅本地诊断用）。
