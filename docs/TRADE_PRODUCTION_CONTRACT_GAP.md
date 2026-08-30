# 日产物 `final_efficiency` 接入口径

> 状态：已解决
>
> 决定日期：2026-08-19
>
> 当前前端 Worker 基线：核心提交 `960b2e4b128978167502d578803e22d192c3e985`，`plan.compute` v3

## 结论

日产物计算统一消费后端给出的逐房总效率 `final_efficiency`。它是可直接乘基础日产量的无量纲倍率，已经包含龙舌兰、但书、可露希尔等特殊订单机制；前端不拆解、不反推，也不再次应用机制倍率。

原先提出的独立 `trade_unit_output_multiplier` 不再是前端日产物功能的契约前置条件。无人机加速也使用目标房间的同一个 `final_efficiency`，因此不再要求“忽略目标房间干员效率、只保留订单机制乘区”。

## 协议适配

前端公开 DTO 将逐房总效率统一归一为：

```json
{
  "room_id": "trade_1",
  "final_efficiency": 3.337
}
```

适配优先级：

1. Worker 直接提供的 `final_efficiency`；
2. 当前 `plan.compute` 的领域总效率字段：贸易 `trade_efficiency`、制造 `manufacture_efficiency`、发电 `power_efficiency`；
3. 旧结果只在协议适配层由已有总分字段迁移，日产物模块本身不读取旧字段。

`trade_skill_efficiency`、`trade_display_efficiency`、`manufacture_skill_efficiency` 等分解字段只用于可证明的效率展示，不参与日产物计算。

## 计算口径

自然产出统一为：

```text
基础日产量 × final_efficiency × 班次时长 / 24
```

无人机等效产能仍按发电站总效率计算：

```text
(1 + Σ(发电站 final_efficiency - 1)) / 2 × 班次时长 / 24
```

目标房间的无人机产出统一为：

```text
基础日产量 × 目标房间 final_efficiency × 无人机等效产能
```

`final_efficiency` 是直接倍率：`1` 表示基础产能，`2.36` 表示基础产能的 `236%`，不得再除以 `100` 或额外加 `1`。

## 责任边界

- 后端负责干员技能、特殊订单机制与最终总效率。
- 前端负责配方归类、基础日产量换算、班次时长加权、无人机折算和搓玉链瓶颈。
- 前端不根据干员姓名识别龙舌兰、但书或可露希尔，也不维护订单机制表。
- 赤金、龙门币订单、经验、源石碎片和合成玉继续分别统计；`final_efficiency` 只提供效率倍率，不改变产物分类。

## 回归要求

- 贸易、制造和发电逐房结果均归一出 `final_efficiency`。
- 自然产出与无人机产出都只受 `final_efficiency` 控制；旧展示字段即使冲突也不得改变结果。
- 特殊贸易组合直接采用后端总效率，不重复乘机制。
- 多班结果继续按 `duration_hours / 24` 以完整精度汇总，最终展示时取整。
