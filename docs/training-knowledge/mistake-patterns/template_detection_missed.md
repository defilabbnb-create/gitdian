# template_detection_missed

## 定义

本地模型没有识别出 starter / template / scaffold / boilerplate，导致把脚手架看成产品机会。

## 当前导出中命中的案例数

- 2

## 典型案例

- pangon/ai-sdlc-scaffold：本地=OK CLONE / Claude=OK CLONE / 最终=OK CLONE
- MP-Tool/MCP-Server-Framework：本地=OK CLONE / Claude=OK CLONE / 最终=OK CLONE

## Claude 如何纠正

- 规则建议：当 README 明确出现 template、scaffold、starter、clone or copy 等表述时，应优先判定为 demo 或 template，而不是把问题归因于产品差异化不足。（1）
- 规则建议：对脚手架类仓库先判断交付形态是否是可直接使用的软件；如果主要价值是初始化结构与最佳实践，默认进入 OK + CLONE。（1）
- 规则建议：当仓库标题或 README 明确写 framework、SDK、foundation、boilerplate 时，优先归类为 infra 而不是 demo 或 product。（1）
- 规则建议：不要用 extractedIdea 里的 SaaS 想象覆盖仓库本体；先以仓库描述和 README 的自我定位为最高优先级。（1）
- 规则建议：如果用户明确但仓库只是帮助开发者搭建系统的基础层，应判为 OK + CLONE，而不是因为有潜在 SaaS 包装就拔高。（1）
- Prompt 建议：先问：用户是直接使用这个仓库完成工作，还是把它复制走后自行改造成项目？若是后者，优先按模板处理。（1）
- Prompt 建议：在判断失败原因时，优先区分不是产品 与 产品但尚弱，不要混淆模板项目和早期工具项目。（1）
- Prompt 建议：先回答：仓库当前交付的是可直接使用的产品，还是供别人继续开发的框架/底座？（1）
- Prompt 建议：要求 oneLinerZh 必须复述仓库实际对象和动作，避免漂移到无关场景如登录权限服务。（1）
- Prompt 建议：在判断 monetization 前，先锁定 repo artifact：产品、工具、框架、模型、模板、教程。（1）

## 建议如何教本地模型

- 在 prompt 里强化 template/starter/scaffold/boilerplate 词汇的负向判断。
- 在启发式层里把 README、topics、仓库名中的模板信号拉高权重。
- Few-shot anchor：增加一个 GOOD 反例锚点：workflow 工具可以早期但必须是可直接使用的软件，不是 repo scaffold。（1）
- Few-shot anchor：增加一个 CLONE 锚点：AI 开发流程目录模板、agent instruction scaffold、project starter repo。（1）
- Few-shot anchor：补一个 MCP/agent infra framework 的 CLONE anchor：即便 README 写 production-ready，也仍是 infra 不是产品。（1）
- Few-shot anchor：补一个 'developer infra with real users but weak standalone monetization' 的 OK + CLONE anchor。（1）

## 可参考的全局聚合

- analysis.training_knowledge 高频错误：one_liner_drift(12) / tool_as_clone(8) / model_or_infra_leakage(7) / early_project_as_good(2) / monetization_overstrict(2) / template_detection_missed(2)
- analysis.money_learning 高频错误：monetization_missed(17) / false_positive_good(10) / template_missed(5) / user_clarity_missed(5) / infra_misclassified(3) / false_negative_clone(1)

> mistake slug: template_detection_missed
