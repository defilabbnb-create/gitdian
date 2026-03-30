# 后续训练集设计建议

## 1. 分类判断集

- 目标：让本地模型更稳定地区分 `值得做 / 值得抄 / 应忽略`。
- 可直接使用：`high_value_positive_cases.jsonl` 作为正样本，`hard_negative_cases.jsonl` 作为负样本，`high_conflict_cases.jsonl` 作为边界样本。
- 当前可用样本规模：正样本 1 / 负样本 68 / 边界样本 5。

推荐 label：

- `GOOD+BUILD`：真实产品或真实工具机会
- `OK+CLONE`：值得借鉴但不该直接照做
- `BAD+IGNORE`：模板、模型能力层、infra、demo、垃圾项目

## 2. 纠偏解释集

- 目标：让本地模型学会解释“为什么错了、怎么改”。
- 输入：本地模型初判 + Claude 复核 + diff + trainingHints。
- 输出：纠偏说明、规则建议、one-liner 修正、是否需要降级或升级。

最适合重点抽样的错误类型：

- one_liner_drift：12
- tool_as_clone：8
- model_or_infra_leakage：7
- early_project_as_good：2
- monetization_overstrict：2
- template_detection_missed：2

## 3. 中文表达集

- 目标：把 one-liner 和 reason 训练得更像创业判断，而不是技术摘要。
- 输入：仓库基础信息 + 本地 one-liner + Claude 修正 one-liner。
- 输出：中文一句话（谁 + 做什么）和创业判断式 reason。

## 4. few-shot / anchor 增量集

- 从 `training_hints_log.jsonl` 抽取高频 `anchorSuggestions`，按 devtool、workflow、API tool、template、model、infra 六大类沉淀 few-shot。

## 5. 人工校准建议

- 优先标记 `human_verified=true` 的高冲突案例。
- `is_training_worthy=true` 但 `human_label` 为空的条目，优先进入人工复核池。
- `is_hard_case=true` 的条目适合作为边界样本集，避免模型只学到容易题。

## 6. 下一步最值钱的构造方向

- 先做 verdict/action 分类集。
- 再做纠偏解释集。
- 最后做中文表达集，把 one-liner 和创业理由单独拉出来微调。
