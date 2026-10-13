# LoreCraft v2.0 验收记录

日期：2026-10-11 ｜ 方式：vitest 自动化（60 项）+ mock 全链路冒烟（真实进程 + curl）

## 一、需求验收标准（requirement §13）

| # | 验收项 | 状态 | 证据 |
|---|--------|------|------|
| 1 | 成长因果：比武胜→武力、解谜→智力 | ✅ | core 测试「事件成长由代码直接结算」「修炼行动概率成长」；LLM 申报 `吃饭→武力` 类被整份拒绝（「LLM 申报：类别不匹配整份拒绝」） |
| 2 | 战斗引擎公式 | ✅ | core「伤害公式」用例（10×1.0×1.0−3=7）；真气不足拒绝、暴击/闪避区间、逃跑成败、lethal/重伤分歧均有用例；**120 场分布模拟**（3 阶段×8 敌×5 种子）无首回合玩家死、平均回合 2~12 |
| 3 | 武学体系 | ✅ | 26 门分布 10/8/6/2（worlddata 测试）；习得门槛校验（`meetsMartialReqs`）、等级提升（修炼 `martialLevelChance` / 事件 `learn`）、跨世保留（「履历入库」断言 martials 带等级）、后续世门槛 −1（`reqDiscountForLives`） |
| 4 | 轮回继承 | ✅ | 集成测试「断粮饿死→履历/记忆任务/新一世可用」：记忆提炼入库、新一世可开；prompt 注入前世记忆由 llm 测试断言（真实叙事引用待试玩） |
| 5 | 结局双轨 | ✅ | 达成型 `checkAchievedEnding` priority 判定用例；选择型「条件不足 400 / 满足可选并写结局章」集成测试；善终由年切 `goodDeath` 触发 |
| 6 | 生存压力 | ✅ | 「断粮扣血并累积，3 天饿死」「有粮不扣血」；银两/温饱/声望在 `applyFixedAction`/`applyOutcome` 结算并有事实文案 |
| 7 | UI：自动滚屏 + 轮回历史 | ✅（滚屏为代码实现+手测项） | LifeView/BattleView 滚动粘底逻辑（上滚暂停/回底恢复）；「轮回历史 API」集成测试 + HistoryView |
| 8 | LLM 异常不崩溃 | ✅ | llm 包：坏 JSON/非法成长/超时/网络错误注入；行动降级=确定性文案或事实战报；战斗演绎降级=模板战报；均不阻塞流程 |

## 二、计划验收矩阵（plan §5）补充项

| 检查 | 结果 | 证据 |
|------|------|------|
| 时间推进 | ✅ | 「时段→日→季→年→年龄」「换年触发年岁事实」「衰老 `agingDecay`（内功大成免疫）」 |
| 事件系统 | ✅ | 「条件过滤与冷却」「冷却 30 天后再触发」「选项 req 不满足不可选」；worlddata checks 全过（引用有效/链 flag 有承接/unlock flag 有出身） |
| 重复请求/结算幂等 | ✅ | 「相同 requestId 重放同结果」「并发提交仅一个成功」「settle 幂等」「retryMemory 不重复处理」 |
| 记忆/摘要失败不阻塞 | ✅ | 「提炼失败→failed 标记→恢复」「摘要失败保留旧摘要」 |
| 世界与属性重置 | ✅ | 新一世由 `createLife` 全量重置（恩怨/银两/声望/日历）；出身初始值测试 |
| 刷新恢复 | ✅ | 冒烟：杀进程重启后 active life 完整还原（day/slot/atk/pendingEvent）；前端 `boot()` 恢复叙事与事件面板 |

## 三、测试统计

```
packages/core      19 passed（含 120 场战斗分布模拟）
packages/worlddata  4 passed（26 武学/29 事件/数据检查/模拟器）
packages/llm       19 passed（四类演绎契约/重试降级/流式扫描）
apps/server        18 passed（生命周期/幂等并发/事件战斗/死亡轮回/结局/历史/记忆）
──────────────────────────────
合计               60 passed（pnpm test）
类型检查           全工作区通过（pnpm typecheck）
前端构建           vite build 通过（91KB，gzip 35KB）
```

## 四、冒烟记录（mock，真实进程）

1. 起服 → `POST /api/lives`（市井游儿）→ 随机身世线绑定
2. `用饭` SSE：49 个 narrative delta + result 快照；温饱 4→8
3. `练武`：武力 5→6（修炼概率成长命中），时辰 0→1
4. `坊市闲逛`：首次即触发事件 e_hunyan，选项携带原始索引；抉择结算正常
5. 杀进程重启 → active life 完整还原（day/slot/atk/pendingEvent）

## 五、未验证项（需 API key 或人工）

| 项 | 阻塞 | 建议动作 |
|----|------|----------|
| DeepSeek 真实演绎（行动/战斗/结局/记忆四类） | 无 `DEEPSEEK_API_KEY` | 配 key 后 `LLM_PROVIDER=deepseek` 玩一世，检查 JSON 稳定性与中文文笔 |
| Claude 冒烟与质量上限对比 | 无 `ANTHROPIC_API_KEY` | 同上 |
| 真实试玩调参 | 上两项 | 记录：事件手感、成长节奏（修炼 25% 概率是否过缓）、战斗回合分布、经济曲线（做工 3-6 两 vs 饭 1 两/住 3 两） |
| 滚屏手测 | 浏览器 | 追加自动滚底、上滚暂停、回底恢复 |
| 事件库 20→50 | 内容制作 | 按首批 20 条的手感反馈补题材缺口（门派线/官府线/商会线事件偏少） |

## 六、与计划的偏差记录

1. 事件选项协议：`EventPresentation.choices` 携带原始索引（服务端按可用性过滤后索引不漂移）。
2. GET `/api/lives/active|:id` 返回 `event` 与 `availableEndings`（刷新恢复与"选择型结局作为行动出现"需要）。
3. `ActResponse/BattleResponse` 携带 `availableEndings`；catalog 增加 `martials` 公开信息（战斗按钮名称/耗气）。
4. 修复：断粮/善终标志在 `restOfDay`/`applyFixedAction`/`applyOutcome` 中原被丢弃——现传播至服务层并正确 `markLifeEnd`。
5. 修复：解锁判定沿用 v2 直接前置语义；`unlock_origin_*` flag 由事件/战斗胜利写入，轮回结算时兑换为出身解锁。
