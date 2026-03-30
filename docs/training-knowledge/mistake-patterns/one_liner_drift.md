# one_liner_drift

## 定义

本地模型的一句话总结跑偏，写成了泛泛而谈的技术摘要，缺少“谁在用、在做什么”。

## 当前导出中命中的案例数

- 5

## 典型案例

- infroware/k8s-janus：本地=OK CLONE / Claude=GOOD BUILD / 最终=GOOD BUILD
- pangon/ai-sdlc-scaffold：本地=OK CLONE / Claude=OK CLONE / 最终=OK CLONE
- modem-dev/hunk：本地=GOOD BUILD / Claude=GOOD BUILD / 最终=GOOD BUILD
- kianwoon/modelweaver：本地=GOOD BUILD / Claude=OK CLONE / 最终=OK CLONE
- MP-Tool/MCP-Server-Framework：本地=OK CLONE / Claude=OK CLONE / 最终=OK CLONE

## Claude 如何纠正

- 规则建议：对安全治理、审批流、访问控制类 developer/workflow 工具，应把团队付费潜力视为强信号，不要因为尚未展示商业闭环就否定 productization path（1）
- 规则建议：不要把“同类很多”直接当成降级理由；若用户、场景、边界、付费逻辑都明确，仍可判为 GOOD（1）
- 规则建议：当 README 明确出现 template、scaffold、starter、clone or copy 等表述时，应优先判定为 demo 或 template，而不是把问题归因于产品差异化不足。（1）
- 规则建议：对脚手架类仓库先判断交付形态是否是可直接使用的软件；如果主要价值是初始化结构与最佳实践，默认进入 OK + CLONE。（1）
- 规则建议：当仓库是本地 CLI/TUI 工作流工具时，先按 tool 判断，不要因为可想象的 SaaS 延展就直接改写成 product。（1）
- Prompt 建议：先检查是否存在清晰的高风险工作流节点，例如审批、授权、过期、审计；这类节点往往比普通提效工具更容易形成企业付费（1）
- Prompt 建议：生成 oneLiner 时必须写出具体用户和动作，避免泛化成“更容易部署上线”这类与仓库内容不符的描述（1）
- Prompt 建议：先问：用户是直接使用这个仓库完成工作，还是把它复制走后自行改造成项目？若是后者，优先按模板处理。（1）
- Prompt 建议：在判断失败原因时，优先区分不是产品 与 产品但尚弱，不要混淆模板项目和早期工具项目。（1）
- Prompt 建议：先用 README 原文约束 oneLinerZh，禁止把『diff viewer』改写成『自动生成 PR review』这类未出现能力。（1）

## 建议如何教本地模型

- 强制 one-liner 模板遵守“谁 + 做什么 + 在什么场景”的结构。
- 把“帮助提升效率”“一个工具”这类空话加入反例 anchor。
- Few-shot anchor：补一个 Kubernetes JIT access / privileged access management 的 GOOD anchor：面向平台团队的临时权限审批与审计工具可视为强创业信号（1）
- Few-shot anchor：补一个 security workflow tool 的 GOOD anchor：访问申请、审批、自动回收、审计留痕构成清晰产品边界（1）
- Few-shot anchor：增加一个 GOOD 反例锚点：workflow 工具可以早期但必须是可直接使用的软件，不是 repo scaffold。（1）
- Few-shot anchor：增加一个 CLONE 锚点：AI 开发流程目录模板、agent instruction scaffold、project starter repo。（1）
- Few-shot anchor：增加一个『高质量本地开发者工作流工具，但缺少团队收费边界 => OK + CLONE』的 anchor。（1）

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(12) / tool_as_clone(8) / model_or_infra_leakage(7) / early_project_as_good(2) / monetization_overstrict(2) / template_detection_missed(2)
- analysis.money_learning 高频错误：monetization_missed(17) / false_positive_good(10) / template_missed(5) / user_clarity_missed(5) / infra_misclassified(3) / false_negative_clone(1)

> mistake slug: one_liner_drift
