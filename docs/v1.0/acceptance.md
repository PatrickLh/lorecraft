# LoreCraft v1.0 验收记录

日期：2026-10-10 ｜ 执行方式：自动化测试（vitest）+ mock 全链路冒烟（curl + 双进程）

## 一、需求验收标准（requirement §11.2）

| # | 验收项 | 状态 | 证据 |
|---|--------|------|------|
| 1 | 一条 run 跨 ≥2 个世界，寿命池共享且正确扣减 | ✅ | `apps/server/test/integration.test.ts`：「寿命上限 65 → 65 → 70」全流程（局 1 通便利店→进青云门死亡；局 2 连通三世界）；冒烟：便利店通关后进入青云门，run id 不变、寿命为结算值 60 |
| 2 | 死亡继承在后续叙事中被明确感知 | ⚠️ 自动部分已验，**真实模型引用待试玩** | 集成测试「继承记忆注入后续世界/后续局的 prompt」断言 prompt 含 `【继承记忆】` 与记忆原文；真实叙事中自然引用需真实模型试玩（见「未验证项」） |
| 3 | 完整循环跑通（通关线与死亡线） | ✅ | 集成测试覆盖两条线；冒烟 curl 跑通关线并重启恢复 |
| 4 | 三种死亡（寿命/体质/心智）触发并进入继承；AGI 归零不死 | ✅ | `packages/core/test/core.test.ts` 三种死亡用例 + AGI 用例；server 测试覆盖体质/寿命死亡路径与死亡计数 |
| 5 | LLM 输出异常不崩溃（重试+降级） | ✅ | llm 测试：坏 JSON/非法 flag/超时/网络错误注入；server 测试「非法 JSON → 环境回合」断言确定性叙事、状态不变、寿命 -1 |
| 6 | 寿命上限继承可见（+5/首次通关） | ✅ | 验收矩阵用例：65（首通）→ 65（重通不重复发放）→ 70（第二世界首通）→ 75（第三世界首通）；`firstClearCapBonusGranted` 字段回传 UI |

## 二、执行计划验收矩阵（plan §5）

| 检查 | 结果 | 证据 |
|------|------|------|
| 同局跨 ≥2 世界 | ✅ | 同上 #1 |
| 继承可感知 | ⚠️ 同需求 #2 | prompt 注入已验；叙事引用待真实模型 |
| 通关线与死亡线 | ✅ | 集成测试两条线 + settle 幂等 |
| 三种死亡 | ✅ | core 测试 + server 测试 |
| LLM 异常注入（无效 JSON/越界/非法 flag/超时/断流） | ✅ | llm 包 5 类注入用例；重试预算共用、超时不重试即降级；`firstClearCapBonusGranted` 无重复奖励 |
| 寿命上限继承（65/65/70） | ✅ | 同需求 #6 |
| 重复请求/结算幂等 | ✅ | 「相同 requestId 重放」「并发提交仅一个成功」「settle 幂等」「memory retry 不重复处理」 |
| 记忆/摘要失败不阻塞 | ✅ | 「失败路径：标记 failed、旧记忆保留、恢复后可重试」「第 20 回合摘要失败保留旧摘要」 |
| 世界与属性重置 | ✅ | 「死亡后重开：属性 10、物品空、寿命=继承上限」；世界 flag 在 enterWorld 时全量初始化、跨局不继承 |
| 刷新恢复 | ✅ | 冒烟：重启服务进程后 `GET /api/runs/active` 完整还原（phase/世界/寿命/回合数）；前端 `boot()` 恢复活跃局与最近叙事 |

## 三、测试统计

```
packages/core     22 passed
packages/worlddata 4 passed
packages/llm      20 passed
apps/server       18 passed
─────────────────────────────
合计              64 passed（`pnpm test`）
类型检查          全工作区通过（`pnpm typecheck`，web 用 vue-tsc）
前端构建          vite build 通过（81KB gzip 32KB）
```

## 四、冒烟记录（mock provider，真实进程）

- 服务端 `mock` 模式启动 → `/api/meta` 正常
- 建局 → 进入便利店 → 9 回合 SSE 流（`event: delta` narrative 增量 + `event: result` 最终快照）→ 通关：+15 寿命、meta 上限 65、解锁青云门、生成记忆任务
- 记忆提炼在 mock 无脚本时按设计走失败兜底（`failed: 1`，不阻塞结算，任务可重试）
- 杀进程重启 → 活跃局完整恢复
- `vite`（5173）+ `server`（8787）双进程：`localhost:5173/api/meta` 经代理返回正常 JSON

## 五、未验证项（需 API key 或人工）

| 项 | 阻塞 | 建议动作 |
|----|------|----------|
| DeepSeek 真实结构化调用 + 记忆提炼 | 无 `DEEPSEEK_API_KEY` | 配 key 后 `LLM_PROVIDER=deepseek` 完成一局，检查 JSON 稳定性与中文叙事质量 |
| Claude 冒烟 | 无 `ANTHROPIC_API_KEY` | 同上，对比叙事质量上限（requirement §9.5） |
| 真实模型试玩：便利店→青云门→风雪山庄 | 上两项 | 记录寿命消耗 vs `balanceHint`（25/22/28）、flag 可达性、记忆引用、叙事/状态冲突（plan P5） |
| 数值平衡调参 | 试玩数据 | 依据实测调整 `packages/core/src/constants.ts` 与世界 `balanceHint` |

## 六、与计划的偏差记录

1. `createRun` 放行条件：实现为「死亡 **或** 三世界全部永久通关后」允许新局——plan §2 的两条规则（死亡才结束 run / 原型完成后允许新局）综合而来，测试已覆盖。
2. `TurnResponse` 增加了 `suggestedActions` 字段：入场建议行动来自世界数据，回合后建议行动来自 LLM 申报，前端需要随快照更新。
3. `WorldCard` 增加了 `entryActions`；`GET /api/meta` 增加了 `openMemoryTaskCount`（前端「记忆待重试」提示需要）。
4. 解锁判定为**直接前置**判定而非传递闭包（修复：通关便利店不应提前解锁风雪山庄）。
5. `GET /api/runs/active` 无活跃局时返回 `200 { run: null }` 而非 404——首启/死亡后查询活跃局是常态请求，404 会在浏览器控制台产生错误噪音（联调反馈修复）。
