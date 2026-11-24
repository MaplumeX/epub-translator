---
name: mm-archive
description: "对 .agents/ADR/ 进行语义替代审查、归档与清理：在新增或升格 ADR 时内联排查被替代的旧记录，或在按需盘点时按未来决策价值分流处理（删除纯机械/小 UI 记录、保留仍有活跃约束的记录、将有历史价值的旧 implemented/ 记录冻结迁入 archived/、清理过时的 proposed/ 与失效的 rejected/）。适用于每次新增/升格 implemented/ ADR 后的替代审查，以及用户要求「归档 ADR」「清理过时决策」「盘点 ADR」「废弃提案」「archive ADR」「prune ADRs」「audit ADRs」「reject ADR」时。"
---

# Archive · ADR 替代审查与语义清理

精简活跃决策库，同时不丢失仍有历史价值的决策脉络。每条记录都必须基于**语义与未来指导价值**判断——文件年龄、字数或清理配额绝不能作为归档标准（字数仅作排查辅助）。

## 1. 先读契约与现场事实

动任何文件前，先读取 `.agents/ADR/AGENTS.md`。结合当前代码、配置、文档、更新的 ADR 以及入站链接，核实旧记录是否仍在约束当前或未来的行为，绝不凭标题猜测。

## 2. 两条触发入口

1. **新增 / 升格 ADR 时的内联替代审查（默认路径）**
   - 每次新增 `implemented/` ADR 或将 `proposed/` ADR 升格为 `implemented/` 时，检索活跃目录（`implemented/`、`proposed/`、`rejected/`）中覆盖同一决策、机制或被否决备选方案的旧记录。
   - 逐条判定完全替代或部分替代，在**同一次变更 / 同一个 PR** 中完成归档、合并删除或双向链接，不把已知重叠拖延到日后盘点。
2. **按需盘点 / 清理或放弃提案（显式触发）**
   - 用户要求清理陈旧 `implemented/`、盘点 ADR 库、或放弃某份 `proposed/` 提案时，对指定范围（或全部活跃记录）逐条应用下方分流规则。

## 3. 按未来决策价值分流（严格按顺序判定）

### `implemented/` 记录
1. **直接删除（不进 `archived/`）**：仅描述小 UI 调整或纯机械改动（无持久命名、兼容、职责边界或行为决策）的记录，直接删除文件并修复/移除入站链接。注意：局部 Bug 修复、性能优化、新能力或实质性行为决策不因改动小而符合删除条件。
2. **保留活跃（留在 `implemented/`）**：只要以下任意一项仍对未来改动有指导意义，就必须保持活跃（不看字数或时间）：
   - 备选方案（alternatives）
   - 职责/所有权边界（ownership boundaries）
   - 负向保证（negative guarantees）
   - 持久化或协议语义（durable or wire semantics）
   - 安全规则（security rules）
   - 重新引入条件（conditions for reintroduction）
   - 若被新记录**部分替代**，保留双方并补齐双向交叉链接；若被**完全替代**且新记录完整吸收了全部独特理由、备选方案、后果、验证要求与已知缺口，也可按合并规则吸收后删除旧文件。
3. **归档封存（`implemented/` → `archived/`）**：决策已完全交付、未来不太可能再指导工作、但仍具历史参考价值的实质性记录，按第 4 节冻结归档。

### `proposed/` 记录
- **绝不归档**：未落地的提案永远不能进入 `archived/`。
- 若提案已过时或被否决：
  1. 清理关联的 `.plan.md`（若为独立计划则删除；若为多记录联合计划且其他记录仍在推进，仅从计划头部移除该 `ADR:` 行）。
  2. 若其否决理由能阻止一个**诱人且真实的误区**，先 `mkdir -p .agents/ADR/rejected/{class}` 并移入 `rejected/{class}/{name}.md`，仅将 `Status: proposed` 改为 `Status: rejected — <one line why>`，其余正文冻结；否则直接删除提案文件。

### `rejected/` 记录
- **仅作护栏保留**：只有当被否决方案仍是未来容易重演的诱人误区，且记录讲清了它为何落败时，才继续保留。
- **失效即删除**：当该方案的前提已过时、已被后续架构演进根除或不再可能被重新提起时，直接删除文件并清理入站链接。

### 校准样例（字数不是判据）
- **直接删除 `implemented/`**：折叠侧边栏小幅视觉微调；无行为变化的纯函数搬迁与 import 重连。
- **保留活跃 `implemented/`**：会话持久化边界或存储目录策略；安全/鉴权不变量；明确写了「等支持某能力时再恢复」的阶段性裁剪决策（重新引入条件仍未满足）。
- **归档 `implemented/`**：已被全新架构完整替代、且旧边界/协议已彻底退场的早期核心设计；已完成使命且不再指导后续演进的一次性大型迁移决策。
- **`rejected/` 留与删**：仍可能被新人重新提议的「合并两个核心模块」提案 → **保留**；依赖已被彻底废弃的旧协议/旧 UI 的否决方案 → **删除**。

## 4. 归档执行步骤（`implemented/` → `archived/`）

1. **移动文件**（保留原分类目录）：

   ```bash
   mkdir -p .agents/ADR/archived/{class}
   mv .agents/ADR/implemented/{class}/{name}.md \
      .agents/ADR/archived/{class}/{name}.md
   ```

2. **仅改头部元数据，正文零改动**：
   将 `Status: implemented` 改为：

   ```markdown
   Status: archived
   Archived: YYYY-MM-DD
   ```

   紧随其后保留一个空行。**正文一字不改**（保留 `implemented/` 结构，不重排格式、不更新过期事实、不修内部出站链接，此后永久冻结）。

## 5. 修复入站链接（只修活跃文件）

对本次所有归档、否决或删除的文件，按文件名全仓检索入站引用：

```bash
grep -rn --exclude-dir=.git --exclude-dir=node_modules "{name}.md" . 2>/dev/null
```

- **更新活跃文档中的相对路径**：根据引用方所在目录重算相对路径（同目录用裸文件名，跨目录按相对层级计算，如 `../../archived/{class}/{name}.md`）；若原引用已失去意义，重定向至当前权威 ADR 或删除该链接。
- **检查 `.plan.md` 依赖影响**：若仍在 `proposed/` 中的其他 `.plan.md` 通过 `Depends on:` / `Constrained by:` 引用了本次移入 `rejected/` 或删除的记录，在汇报中明确标注该 Plan 已失效需修订。
- **严格隔离冻结区**：严禁修改任何 `archived/` 历史文件（含本次刚刚归档的记录），也不要检查或修复 `archived/` 内部的出站链接。
- 代码注释中的 `ADR <date>-<slug>` 不含路径，无需改动。

## 6. 汇报与退出条件

向用户简明汇报：
- 保留活跃的 `implemented/`（含补齐双向链接的记录）
- 已归档至 `archived/` 的记录
- 已直接删除的 `implemented/` / `rejected/` / `proposed/` 记录
- 已移入 `rejected/` 的提案及已清理的 `.plan.md`（如有）
- 所有**边界案例（borderline cases）**及其判定理由，供 PR Review 复核
- 修复的入站链接与受影响的后续 Plan（如有）

**退出条件**：
- 范围内每条 ADR 均已完成语义判定与对应迁移/删除；无任何 `proposed/` 或 `rejected/` 记录进入 `archived/`。
- 所有新归档记录仅修改了 `Status: archived` 与 `Archived: YYYY-MM-DD` 头部元数据，正文零改动。
- 除 `archived/` 历史文件外，全仓无因本次操作失效的入站链接。
- 工作区保持未提交状态（除非用户明确要求），交给 PR Review / 用户统一把关。
