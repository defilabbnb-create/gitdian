# tool_as_clone

## 定义

本地模型把真实工具机会压成了只值得借鉴，通常发生在 developer tool / workflow tool / API tool 上。

## 当前导出中命中的案例数

- 1

## 典型案例

- infroware/k8s-janus：本地=OK CLONE / Claude=GOOD BUILD / 最终=GOOD BUILD

## Claude 如何纠正

- 规则建议：对安全治理、审批流、访问控制类 developer/workflow 工具，应把团队付费潜力视为强信号，不要因为尚未展示商业闭环就否定 productization path（1）
- 规则建议：不要把“同类很多”直接当成降级理由；若用户、场景、边界、付费逻辑都明确，仍可判为 GOOD（1）
- Prompt 建议：先检查是否存在清晰的高风险工作流节点，例如审批、授权、过期、审计；这类节点往往比普通提效工具更容易形成企业付费（1）
- Prompt 建议：生成 oneLiner 时必须写出具体用户和动作，避免泛化成“更容易部署上线”这类与仓库内容不符的描述（1）

## 建议如何教本地模型

- 只要用户明确、工作流痛点明确、边界清楚，就不要因为未验证收费而自动压成 CLONE。
- 给 devtool / workflow / API tool 增加正向 few-shot anchors。
- Few-shot anchor：补一个 Kubernetes JIT access / privileged access management 的 GOOD anchor：面向平台团队的临时权限审批与审计工具可视为强创业信号（1）
- Few-shot anchor：补一个 security workflow tool 的 GOOD anchor：访问申请、审批、自动回收、审计留痕构成清晰产品边界（1）

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(12) / tool_as_clone(8) / model_or_infra_leakage(7) / early_project_as_good(2) / monetization_overstrict(2) / template_detection_missed(2)
- analysis.money_learning 高频错误：monetization_missed(17) / false_positive_good(10) / template_missed(5) / user_clarity_missed(5) / infra_misclassified(3) / false_negative_clone(1)

> mistake slug: tool_as_clone
