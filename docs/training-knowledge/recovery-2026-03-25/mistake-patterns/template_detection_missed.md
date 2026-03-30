# template_detection_missed

## 定义

本地模型没有识别出 starter / template / scaffold / boilerplate，导致把脚手架看成产品机会。

## 当前导出中命中的案例数

- 0

## 典型案例

- 当前样本中暂无明确案例。

## Claude 如何纠正

- 这批样本里还没有足够多的规则建议。

## 建议如何教本地模型

- 在 prompt 里强化 template/starter/scaffold/boilerplate 词汇的负向判断。
- 在启发式层里把 README、topics、仓库名中的模板信号拉高权重。

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(62) / tool_as_clone(47) / early_project_as_good(21) / model_or_infra_leakage(20) / template_detection_missed(2) / monetization_overstrict(1)
- analysis.money_learning 高频错误：monetization_missed(46) / false_positive_good(35) / template_missed(11) / infra_misclassified(10) / user_clarity_missed(10) / false_negative_clone(2)

> mistake slug: template_detection_missed
