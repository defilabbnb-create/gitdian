# model_or_infra_leakage

## 定义

本地模型放跑了 model / infra / framework / router / provider 这类项目，让它们进入了本不该进入的高优先区。

## 当前导出中命中的案例数

- 0

## 典型案例

- 当前样本中暂无明确案例。

## Claude 如何纠正

- 这批样本里还没有足够多的规则建议。

## 建议如何教本地模型

- 把 model / infra / framework / router / provider / fallback layer 继续作为默认降权对象。
- 只在出现明确产品边界、明确目标用户和收费路径时，才允许从能力层翻盘。

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(62) / tool_as_clone(47) / early_project_as_good(21) / model_or_infra_leakage(20) / template_detection_missed(2) / monetization_overstrict(1)
- analysis.money_learning 高频错误：monetization_missed(46) / false_positive_good(35) / template_missed(11) / infra_misclassified(10) / user_clarity_missed(10) / false_negative_clone(2)

> mistake slug: model_or_infra_leakage
