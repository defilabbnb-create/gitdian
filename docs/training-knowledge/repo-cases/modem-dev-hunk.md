# modem-dev/hunk

- 仓库链接：https://github.com/modem-dev/hunk
- 导出时间：2026-03-24T00:46:21.949Z
- 来源阶段：claude_review / local_vs_claude_diff / claude_audit
- 挣钱优先级：可抄 / 67

## Repo 基础信息

- 描述：Review-first terminal diff viewer for agentic coders
- 语言：TypeScript
- Stars：124
- Topics：cli / code-review / diff / git / tui

## 本地模型初判

- 一句话：一个帮开发者自动生成 PR review的工具
- 判断：GOOD / BUILD
- 类型：product
- 原因：这个方向需求明确，虽然同类不少，但只要切口更准，还是值得继续做。

## Claude 复核

- 一句话：一个帮使用 AI 编码代理的开发者在终端里审阅代码 diff 和注释的工具
- 判断：GOOD / BUILD
- 类型：tool
- 原因：这是一个面向明确开发者工作流的清晰工具切口，用户、场景和功能边界都足够明确；虽然仍处于早期，但已经具备现实的产品化路径与合理付费可能性，可以按 GOOD + BUILD 继续推进。

## 最终融合结果

- 一句话：一个帮使用 AI 编码代理的开发者在终端里审阅代码 diff 和注释的工具
- 判断：GOOD / BUILD
- 类型：tool
- 来源：claude_review
- 原因：这是一个面向明确开发者工作流的清晰工具切口，用户、场景和功能边界都足够明确；虽然仍处于早期，但已经具备现实的产品化路径与合理付费可能性，可以按 GOOD + BUILD 继续推进。

## 差异与学习点

- diffTypes：one_liner_drift / category_mismatch
- fallback replay diff：无
- conflict score：3
- training mistakes：one_liner_drift / tool_as_framework / capability_as_product / model_or_infra_leakage

## Audit 视角

- 最新 audit headline：先修 product reality 与 one-liner grounding，再处理 developer tool 被压成 CLONE 的次级偏差
- 是否需要复看：否
- 问题类型：one_liner_drift
- 问题原因：最终方向可保留，但单行描述仍是系统最高频误差源，说明项目判断经常先被泛化描述带偏。

## 人工标注预留

- human_verified: false
- human_label: null
- human_note: null
- is_training_worthy: true
- is_hard_case: true
