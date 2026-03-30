# tool_as_clone

## 定义

本地模型把真实工具机会压成了只值得借鉴，通常发生在 developer tool / workflow tool / API tool 上。

## 当前导出中命中的案例数

- 0

## 典型案例

- 当前样本中暂无明确案例。

## Claude 如何纠正

- 这批样本里还没有足够多的规则建议。

## 建议如何教本地模型

- 只要用户明确、工作流痛点明确、边界清楚，就不要因为未验证收费而自动压成 CLONE。
- 给 devtool / workflow / API tool 增加正向 few-shot anchors。

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(62) / tool_as_clone(47) / early_project_as_good(21) / model_or_infra_leakage(20) / template_detection_missed(2) / monetization_overstrict(1)
- analysis.money_learning 高频错误：monetization_missed(46) / false_positive_good(35) / template_missed(11) / infra_misclassified(10) / user_clarity_missed(10) / false_negative_clone(2)

> mistake slug: tool_as_clone
