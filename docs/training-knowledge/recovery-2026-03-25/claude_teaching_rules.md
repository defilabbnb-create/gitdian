# Claude 教师规则集

目标不是让 122B 更会讲故事，而是让它在证据不足时更保守、更少误导用户。

## 1. 什么时候不能写“帮谁做什么”

- README / description 没有明确用户和 use-case 时，不要写产品句。
- user unclear / use-case unclear / README 很薄时，直接退回技术实现或能力示例表达。
- 目标用户仍不清楚时，必须明确说“不清楚”，不能脑补 ICP。

## 2. monetization 什么时候必须保守

- 只有真实用户 + 明确场景都成立，才允许写可收费。
- model / infra / demo / template 默认保守化，不先写订阅、企业版、托管版。
- monetization 与 why/use-case 打架时，优先降级 monetization。

## 3. infra / model / demo 的边界

- infra / framework / router / provider / SDK 默认是能力层，不是产品。
- model / inference / runtime 默认是模型能力，不是工具机会。
- demo / template / scaffold / starter / boilerplate / example 默认是示例，不是产品。

## 4. 冲突时怎么降级

- headline 强，但 user unclear -> 降级。
- headline 强，但 category 指向 infra/model/demo -> 降级。
- snapshot 已判 non-promising 或 nextAction=SKIP，但 headline 仍像机会 -> 降级。
- fallback 来源一律低信任，不继续保留强 headline。

## 5. 首页 headline 安全句式

- 这个项目的中文摘要还在校正，先看最终结论与详情。
- 这个项目暂时更适合放在低优先观察池里。
- 这个项目当前更像技术实现或能力示例，具体用户和使用场景还不够清晰。

## 6. 当前样本聚合

- 高冲突样本：0
- one-liner drift 相关样本：0
- product_vs_model/infra 相关样本：0
- 高频训练错误：one_liner_drift(62) / tool_as_clone(47) / early_project_as_good(21) / model_or_infra_leakage(20) / template_detection_missed(2) / monetization_overstrict(1)
- 高频 money 错误：monetization_missed(46) / false_positive_good(35) / template_missed(11) / infra_misclassified(10) / user_clarity_missed(10) / false_negative_clone(2)
