# capability_as_product

## 定义

本地模型把模型能力层、infra 能力层、路由层或框架能力，当成了可直接卖的产品机会。

## 当前导出中命中的案例数

- 0

## 典型案例

- 当前样本中暂无明确案例。

## Claude 如何纠正

- 这批样本里还没有足够多的规则建议。

## 建议如何教本地模型

- 把“能力层”和“产品层”分开判断，先问是否有明确用户和清晰使用边界。
- 遇到 router / provider / proxy / framework / SDK / gateway 这类词时，先默认是能力层，再看是否有真实产品包装。

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(62) / tool_as_clone(47) / early_project_as_good(21) / model_or_infra_leakage(20) / template_detection_missed(2) / monetization_overstrict(1)
- analysis.money_learning 高频错误：monetization_missed(46) / false_positive_good(35) / template_missed(11) / infra_misclassified(10) / user_clarity_missed(10) / false_negative_clone(2)

> mistake slug: capability_as_product
