# LoreCraft

> **文字冒险 + LLM 动态叙事 + 无限流世界穿梭 + Roguelite 死亡继承**

个人原型，验证一个核心问题：「LLM 动态叙事 + 代码权威状态机」能否支撑一个**死亡有痛感、继承有感知**的无限流 Roguelite。

- 需求文档：`docs/v1.0/requirement.md`
- 执行计划：`docs/v1.0/plan.md`
- 验收记录：`docs/v1.0/acceptance.md`

## 架构

```
apps/
  web/        Vue3 + Vite —— 枢纽、世界界面、叙事流、状态侧栏
  server/     Node + Hono + SQLite —— 权威状态、回合编排、事务、幂等、SSE
packages/
  core/       状态类型、常量表、纯 reducer、三关校验、继承与记忆规则（前后端共享）
  worlddata/  三个手写世界剧本（规则怪谈 / 修仙 / 武侠）+ 数据完整性检查
  llm/        provider 抽象（mock / DeepSeek / Claude）、prompt、结构化输出、流式扫描、记忆提炼、摘要
```

同语言 monorepo（pnpm workspace），游戏状态机 / LLM schema / 世界库结构前后端 import 同一份类型。

## 快速开始

```bash
pnpm install
cp .env.example .env        # 默认 LLM_PROVIDER=mock，无需 API key 即可玩
pnpm dev:server             # http://127.0.0.1:8787
pnpm dev:web                # http://localhost:5173（/api 代理到 8787）
```

浏览器打开 http://localhost:5173 。存档为 SQLite，默认 `./data/lorecraft.db`（可用 `SQLITE_PATH` 改）。

> 注意：Vite 默认只监听 `localhost`（IPv6），请用 `http://localhost:5173` 而非 `127.0.0.1` 访问。

### 常用命令

```bash
pnpm typecheck   # 全工作区类型检查
pnpm test        # 全工作区测试（vitest）
pnpm build       # 构建前端
pnpm check       # typecheck + test
```

## LLM 配置

`.env` 中 `LLM_PROVIDER` 三选一：

| 值 | 说明 |
|----|------|
| `mock`（默认） | 无需 key；支持斜杠命令联调（见下） |
| `deepseek` | 需 `DEEPSEEK_API_KEY`；OpenAI 兼容接口，`json_object` 结构化输出 |
| `claude` | 需 `ANTHROPIC_API_KEY`；Messages API 强制工具调用 |

切换后重启 `pnpm dev:server`。key 只存在服务端 `.env`，前端永不接触。

### Mock 联调命令

`LLM_PROVIDER=mock` 时，在行动输入框里可用：

```
/flag read_ruleboard        申报达成 flag
/win                        申报全部通关 flag（前置不满足会被系统拒绝）
/dmg con 3  /heal mind 2    属性伤害 / 恢复（±3/回合，代码校验）
/life -5                    寿命事件增减（±10/回合）
/gain 手电筒|照亮黑暗        获得物品
/lose 手电筒                按名称失去物品（重名会被拒绝）
/tag 中毒  /untag 中毒      增删状态标记
/bad-json                   注入非法 JSON（触发重试→环境回合降级）
/bad-flag                   注入非法 flag（触发重试→降级）
```

## 存档管理

- 位置：`SQLITE_PATH`（默认 `./data/lorecraft.db`），WAL 模式
- 备份：停服后复制 db 文件即可
- 重置：停服后删除 `data/` 目录，下次启动自动建库
- 单机单活跃局：死亡或完成全部世界后才能开新局；刷新页面自动恢复当前局

## 设计要点（详见需求文档）

- **寿命制**：全局回合池，每回合 -1，归零即死；通关 +15；首次永久通关上限 +5
- **代码权威**：LLM 每回合通过大 schema 申报状态变更，三关校验（范围/白名单/合法性），失败重试一次后降级为环境回合；LLM 无判死权
- **死亡继承**：记忆（≤20 条，LLM 提炼）+ 寿命上限 + 世界解锁，注入后续局 prompt
- **一次性重试预算**：schema/范围/白名单/合法性与可恢复网络错误共用；超时直接降级

## 已知限制（v1.0）

- DeepSeek / Claude 仅有 fetch stub 契约测试；**尚未用真实 key 冒烟**（无 key 环境）
- 真实模型试玩（叙事质量、flag 节奏、数值平衡）待执行，见 `docs/v1.0/acceptance.md`
- 世界内幕转换提示为系统消息，不做额外 LLM 转场调用（计划如此）
