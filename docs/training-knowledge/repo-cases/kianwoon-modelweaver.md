# kianwoon/modelweaver

- 仓库链接：https://github.com/kianwoon/modelweaver
- 导出时间：2026-03-24T00:46:21.949Z
- 来源阶段：claude_review / local_vs_claude_diff / claude_audit
- 挣钱优先级：可抄 / 58

## Repo 基础信息

- 描述：Multi-provider model orchestration proxy for Claude Code. Route agent roles (planning, coding, research) to different LLM providers with automatic fallback, daemon mode, desktop GUI, config hot-reload, and crash recovery.
- 语言：TypeScript
- Stars：1
- Topics：ai-agents / anthropic / api-proxy / claude / claude-code / desktop-gui / developer-tools / fallback / hono / hot-reload / llm / llm-proxy

## 本地模型初判

- 一句话：一个帮团队管理多代理编码流程的工具
- 判断：GOOD / BUILD
- 类型：unknown
- 原因：这是个典型工具型机会，问题明确，也有机会很快包装成收费产品。

## Claude 复核

- 一句话：一个帮 Claude Code 重度用户把不同代理角色请求路由到不同大模型提供商并自动故障切换的本地代理工具
- 判断：OK / CLONE
- 类型：tool
- 原因：用户和场景是明确的：Claude Code 用户希望把 planning、coding、research 等请求按模型或供应商路由，并在限流或故障时自动切换。它作为本地开发者工具边界也清晰。但当前形态更像单机代理能力层，而不是可直接建设的产品：缺少团队协作、策略托管、审计、可观测、权限控制或集中管理等付费工作流边界，因此更适合借鉴其路由与 fallback 思路，而不是按现状直接产品化。

## 最终融合结果

- 一句话：一个帮 Claude Code 重度用户把不同代理角色请求路由到不同大模型提供商并自动故障切换的本地代理工具
- 判断：OK / CLONE
- 类型：tool
- 来源：claude_review
- 原因：用户和场景是明确的：Claude Code 用户希望把 planning、coding、research 等请求按模型或供应商路由，并在限流或故障时自动切换。它作为本地开发者工具边界也清晰。但当前形态更像单机代理能力层，而不是可直接建设的产品：缺少团队协作、策略托管、审计、可观测、权限控制或集中管理等付费工作流边界，因此更适合借鉴其路由与 fallback 思路，而不是按现状直接产品化。

## 差异与学习点

- diffTypes：local_good_claude_ok / one_liner_drift / category_mismatch / product_vs_model_mismatch
- fallback replay diff：无
- conflict score：5
- training mistakes：capability_as_product / one_liner_drift / model_or_infra_leakage

## Audit 视角

- 最新 audit headline：先修 product reality 与 one-liner grounding，再处理 developer tool 被压成 CLONE 的次级偏差
- 是否需要复看：否
- 问题类型：capability_as_product / model_or_infra_leakage
- 问题原因：本地曾给 GOOD，但它更像本地代理/路由能力层，不应因可想象的 SaaS 包装被抬升为产品。 / 出现 product_vs_model_mismatch，说明底层能力/路由器仍会漏进产品判断链。

## 人工标注预留

- human_verified: false
- human_label: null
- human_note: null
- is_training_worthy: true
- is_hard_case: true
