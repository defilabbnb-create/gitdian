# Claude 教本地模型的知识沉淀层

- 导出时间：2026-03-24T23:57:41.221Z
- 导出版本：training-knowledge-export-v1
- 样本总数：160
- 高冲突案例：0
- 高价值正样本：1
- 困难负样本：116

## 目录说明

- `weekly-audits/`：每次导出时生成一份周报式 audit 摘要，记录系统偏差和高优先修正建议。
- `mistake-patterns/`：把高频误判沉淀成单独文档，包含定义、案例、Claude 纠偏方式和本地模型教学建议。
- `repo-cases/`：挑选高冲突、高价值和典型负样本，生成可人工阅读的仓库案例卡。
- `datasets/`：面向后续训练集构造的 JSONL 资产和训练任务设计文档。

## 数据来源

- Claude review overlay
- Claude audit
- fallback replay diff
- local vs Claude diff
- trainingHints / analysis.training_knowledge / analysis.money_learning

## 导出内容

- `claude_review_log.jsonl`：统一训练 record 主日志。
- `training_hints_log.jsonl`：只保留 trainingHints 相关字段，方便后续做规则和 prompt 学习。
- `audit_reports.jsonl`：最新 audit 报告导出。
- `high_conflict_cases.jsonl`：本地与 Claude 差异最大的样本。
- `high_value_positive_cases.jsonl`：更值得做成产品的正样本。
- `hard_negative_cases.jsonl`：容易误判但应该压下去的负样本。
- `teacher_positive_samples.jsonl / teacher_negative_samples.jsonl / teacher_boundary_samples.jsonl`：可直接拿来做教师样本池与人工校准。
- `*_repair_pairs.jsonl`：按 one-liner / category / user / monetization / action-verdict 拆开的 122B 校正样本。

## 当前聚合信号

- 最新 audit 偏差：too_optimistic
- 最新 audit headline：先修 product reality 与 one-liner grounding，再处理 developer workflow 工具被误压的问题
- 高频 training mistake：one_liner_drift(62) / tool_as_clone(47) / early_project_as_good(21) / model_or_infra_leakage(20)
- 高频 money mistake：monetization_missed(46) / false_positive_good(35) / template_missed(11) / infra_misclassified(10)
- 高频 diff type：one_liner_drift(58) / category_mismatch(46) / local_good_claude_ok(21) / product_vs_model_mismatch(17)

## 人工标注预留字段

- `human_verified`
- `human_label`
- `human_note`
- `is_training_worthy`
- `is_hard_case`
