# model_or_infra_leakage

## 定义

本地模型放跑了 model / infra / framework / router / provider 这类项目，让它们进入了本不该进入的高优先区。

## 当前导出中命中的案例数

- 3

## 典型案例

- modem-dev/hunk：本地=GOOD BUILD / Claude=GOOD BUILD / 最终=GOOD BUILD
- kianwoon/modelweaver：本地=GOOD BUILD / Claude=OK CLONE / 最终=OK CLONE
- MP-Tool/MCP-Server-Framework：本地=OK CLONE / Claude=OK CLONE / 最终=OK CLONE

## Claude 如何纠正

- 规则建议：当仓库是本地 CLI/TUI 工作流工具时，先按 tool 判断，不要因为可想象的 SaaS 延展就直接改写成 product。（1）
- 规则建议：如果 README 只证明单机使用体验，而没有团队协作、审批、审计、托管等证据，不要把 productization path 判为真。（1）
- 规则建议：对 developer tool 可以放宽已收费要求，但仍要区分『清晰工具』与『已具备可收费产品边界』。（1）
- 规则建议：当项目核心价值是本地路由、代理、fallback、配置热重载这类能力层时，除非输入明确出现团队工作流或托管控制面，否则默认降为 OK + CLONE（1）
- 规则建议：不要把 developer tool 一律判成 GOOD；只有当它已经形成清晰的付费工作流边界，如审计、审批、监控、协作或集中策略管理时，才升到 GOOD（1）
- Prompt 建议：先用 README 原文约束 oneLinerZh，禁止把『diff viewer』改写成『自动生成 PR review』这类未出现能力。（1）
- Prompt 建议：在判断 GOOD 前增加一步：仓库是否已展示团队工作流层，而不只是优秀的本地交互层？（1）
- Prompt 建议：要求从输入中逐条抽取已证实的用户、动作、交付形态，禁止用 extractedIdea 中的想象型 SaaS 描述覆盖仓库事实。（1）
- Prompt 建议：先问：用户是在完成一个工作流，还是只是在获得一个底层能力？如果主要是底层能力层，优先判 CLONE（1）
- Prompt 建议：禁止从 README 中的本地代理工具自动脑补成云网关 SaaS；只有输入明确提到托管、团队控制、可观测或企业需求时才可推演商业化（1）

## 建议如何教本地模型

- 把 model / infra / framework / router / provider / fallback layer 继续作为默认降权对象。
- 只在出现明确产品边界、明确目标用户和收费路径时，才允许从能力层翻盘。
- Few-shot anchor：增加一个『高质量本地开发者工作流工具，但缺少团队收费边界 => OK + CLONE』的 anchor。（1）
- Few-shot anchor：增加一个『review-first diff viewer 只有本地终端形态时，不应自动升级为 SaaS 审批平台』的反例 anchor。（1）
- Few-shot anchor：增加一个 CLONE anchor：本地 LLM proxy / router / fallback daemon，用户和用途明确，但缺少团队控制面与付费工作流（1）
- Few-shot anchor：增加一个一致性 anchor：若 verdict=GOOD 但多个核心布尔字段为 false，应视为判定失真（1）
- Few-shot anchor：补一个 MCP/agent infra framework 的 CLONE anchor：即便 README 写 production-ready，也仍是 infra 不是产品。（1）

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(12) / tool_as_clone(8) / model_or_infra_leakage(7) / early_project_as_good(2) / monetization_overstrict(2) / template_detection_missed(2)
- analysis.money_learning 高频错误：monetization_missed(17) / false_positive_good(10) / template_missed(5) / user_clarity_missed(5) / infra_misclassified(3) / false_negative_clone(1)

> mistake slug: model_or_infra_leakage
