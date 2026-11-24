---
name: mm-implement
description: 按已批准的 .plan.md 或对话计划逐步骤执行开发，每完成一步即执行并记录该步验证后再推进。适用于用户明确要求「按 plan 做」「开工」「开始实现」「继续做」「implement the plan」「execute the plan」「continue the plan」「resume the plan」，或询问计划剩余进度（如「what's left in the plan」）时。前提是仓库中存在 .plan.md 或当前对话已有经 mm-plan 确认的计划——两者皆无时应走规划（mm-plan）或微小的直接修改。
---

# Implement · 按计划实施

计划是在代码尚未落地时立下的契约。执行阶段最容易失控的不是写代码本身，而是范围蔓延、跳过验证，以及为了迁就实现而擅自篡改既定决策。

## 1. 入口检查

定位仓库根目录（非 git 仓库时回退到当前目录），查找待执行计划（标准位置为 `.agents/ADR/proposed/*.plan.md`，同时兼容子目录遗留计划）：

```bash
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
find "$REPO_ROOT/.agents/ADR/proposed" -name '*.plan.md' 2>/dev/null | sort
```

- **不存在 `.plan.md`**：检查当前对话是否已有经 `mm-plan` 确认、且按其规则无需落盘的对话计划；若有，直接按其步骤与验证规则执行。若两者皆无，则不属于本 skill 职责——微小修改直接改即可，较大需求应停下并建议先走 `mm-plan`；若用户坚持无计划直接开发，须明确声明处于「无计划开发」状态并在最终报告中记录该偏离。
- **存在 `.plan.md`（单份或多份）**：先只读扫描所有 `.plan.md` 的头部（`ADR:`、`Depends on:`、`Constrained by:`）以及各自 `## Steps` 中的 `Verify:` 实测记录，将每份计划归类：
  - **Ready（可执行）**：无 `Depends on:` / `Constrained by:`，或它们指向的 ADR 均已位于 `implemented/`（包含步骤已全跑完但上次中断尚未完成收口升格的计划）。
  - **Blocked（被前置阻塞）**：至少有一条 `Depends on:` / `Constrained by:` 仍指向 `proposed/` 中的 ADR（标出具体阻塞源及该前置计划当前状态）。
  - **Invalidated（前置失效）**：至少有一条依赖指向 `rejected/` 中的 ADR（须退回 `mm-plan` 修订或废弃）。

- **多 Plan 队列裁决**（当存在多个 `.plan.md` 时）：
  - **用户未指定目标**：向用户展示解析出的依赖拓扑与状态队列。若仅有 1 份 **Ready**（其余为 `Blocked`），直接推荐并确认执行该 **Ready** 计划；若存在多个相互独立的 **Ready** 计划，只列出这些 **Ready** 项请用户选择。
  - **用户指定了处于 `Blocked` 的计划**：拦截并说明缺失的前置交付（前置 ADR 仍在 `proposed/` 未随交付升格），建议先完成前置计划，除非用户明确授权基于当前代码实现直接继续；绝不静默越序开工。
  - **选定目标后**：通读目标计划全篇、`.agents/ADR/AGENTS.md`（若存在，重点核对 `## References from code` 格式），以及计划头部 `ADR:`、`Depends on:` 和 `Constrained by:` 指向的所有记录。执行阶段 ADR 为只读约束，用于界定边界，不授权推翻决策。

**前置完整性红线**：执行开始时，`ADR:`、`Depends on:` 与 `Constrained by:` 指向的记录必须已全部存在。若计划里仍有「去创建某份 ADR」的步骤，或存在未放行的 `proposed/` / `rejected/` 前置依赖，说明规划阶段漏掉了前置决策或前置尚未交付，立即停下并建议先完成前置交付或通过 `mm-plan` 补齐修订。

## 2. 进度查询与断点续做

- **仅查询进度**（如「计划还剩多少未完成」）：全程只读，不改代码，不执行带副作用的操作。核对 `## Steps` 中各步 `Verify:` 旁记录的实测结果、相关文件现状及 `## Verification` 复选框，汇报已完成项、待办项与待人工核验项后退出。
- **跨会话「继续做」**：严禁凭印象跳过前序步骤。结合 `git status` / 现有代码与 `## Steps` 中已记录的 `Verify:` 结果定位首个未完成或未验证的步骤；若某步无法确认是否真正通过，先重跑其 `Verify:` 命令再向后推进。

## 3. 实施前检查（Preflight）

- 逐项核对 `## Prerequisites`。任何缺失的密钥、账号、工具或服务必须如实报告为缺失，绝不 mock、静默跳过或临时打桩。
- 检查工作区状态。若发现并非由你产生的未提交改动且即将触及同一批文件，先停下来向用户确认。

## 4. 推进步骤

按顺序连续执行所有步骤（若用户仅指定了部分步骤，只完成该子集并明确说明其余未执行步骤），步骤之间无需逐一请示。仅当执行中命中 `## Stop points` 预设的触发条件（或遇不可逆外部操作前的确认边界）及其他阻塞条件时，**立即停下汇报并等待用户确认**，禁止擅自绕过或强行跨入下一步：

### 步骤验证闭环
- 每完成一步，立刻运行该步内联的 `Verify:` 命令。
- 绿灯通过后，将 `.plan.md` 对应 `Verify:` 旁的 `pending` 替换为**一行精简实测结论**（日期 + 实测覆盖范围/计数，如 `passed 2026-11-18: scanned 8 .tsx, 1 .css — 0 errors`；禁止只写 `passed`）。排错过程与修复细节留在对话汇报，不要把长段过程写进 `Verify:` 行。未通过或实际扫描数为 0 的步骤不算完成，禁止进入下一步。
- **失败重试上限**：若 `Verify:` 失败，围绕当前步骤做最多 2 次局部修复并重跑；若同一错误连续失败、根因超出本步范围，或暴露出前提失效 / ADR 冲突，立即停下汇报，绝不陷入盲改循环。

### 范围与代码注释纪律
- **`## Not in scope` 即禁区**：在范围之外顺手发现的问题只记入最终报告并保持原样，不擅自顺手修改，避免把聚焦的改动膨胀成无法审阅的大 diff。
- **长期约束注释**：写下依赖某项长期约束的代码时，在同一次编辑中按 `.agents/ADR/AGENTS.md` 的 `## References from code` 格式同步落注——先写清违反约束的后果，再附 `See ADR <date>-<slug>.`（不得写入公开 API 文档注释）。架构/存储/交互契约等核心约束文件同样适用，不只限于样式文件。

### 涉及 `mm-ui` 的步骤
当某一步标注了 `mm-ui`，或该步实际涉及 UI 组件、弹窗/表单、样式或 `empty / loading / error / edge` 状态时，先加载 [`skills/mm-ui/SKILL.md`](../mm-ui/SKILL.md) 并遵守其设计硬规范与对应按需参考（写组件/状态/排错时必读 `references/antipatterns-and-recipes.md`）：
- **先定方向与状态**：同一视觉交付在首次进入 UI 构建前简要对齐视觉调性与需要覆盖的状态（`default` 拟真数据、`empty`、`loading`、`error`、`edge`），后续步骤沿用该方向。
- **核验与收口**：涉及配色须通过 `check_contrast.py`；有可运行页面时优先用 `shoot.py`（支持 `--serve` 自动启停预览服务）检查桌面/移动视口与异常态渲染，确认无横向溢出或运行时报错后再推进下一步。

## 5. 当现实与计划冲突时

- **与已定 ADR 冲突**：若发现 `implemented/` 或已定案核心决策不再成立，停下说明原因，建议用 `mm-plan` 起草替代记录，绝不为迁就代码改写原 ADR。若仅在实施中微调了局部客观参数或细节（未推翻主方向），**不得静默改完不报**：全量完成并在第 6 节升格为 `implemented/` 时同步反映这些客观事实，同时在最终报告中单列改前/改后值、原因与风险供 PR Review 核对；若中途停下或仅执行了部分步骤，则保留在 `proposed/` 并在汇报中标出待确认项。
- **前提条件失效**（文件被删改、依赖变更、API 行为与预期不符）：停下并汇报，由用户决定修订计划还是调整路径，绝不静默偏离。
- **命中停止条件（Stop point）**：执行中触发 `## Stop points` 所列异常/风险条件或不可逆外部操作边界时，立即停下并询问用户，等待明确指令后再继续，不自行发明 workaround。

## 6. 交付升格与替代审查（同 PR 收口）

**PR Review 即验收闸门**：仅当目标 `.plan.md` **全部步骤执行完成、每步 `Verify:` 均通过**，且未发生核心决策漂移、未命中阻塞停止、也非仅执行用户指定子集时，才在同一工作区/分支内原子完成以下收口（部分执行或受阻停止时**跳过本节**，保持 `.plan.md` 与 `proposed/` ADR 原样等待续做）：

1. **核对交付完整性与自动验收项**
   - 核对 `.plan.md` 中所有步骤的 `Verify:` 行均已填入实测范围与日期（无 `pending` 残留），且关键约束文件已按规范落注 `See ADR <date>-<slug>.`。
   - 逐条检查头部列出的 `ADR:`：其 `## Acceptance criteria` 是否已在代码中真实落地。若有某份 ADR 尚未完全交付，停下并向用户说明——绝不把半成品迁入 `implemented/`。
   - 运行 `## Verification` 中可由你执行的最终检查命令并记录结果；需要人工判断或真机核验的条目保留清单并在最终报告中单列，供 PR Review 审阅确认（严禁虚构人工测试结论）。

2. **删除计划文件并升格 ADR（`proposed/` → `implemented/`）**
   - 删除对应的 `.agents/ADR/proposed/{delivery}.plan.md`。
   - 按各自所属 `{class}` 移动计划头部列出的全部已交付 `ADR:`（一次交付可能横跨多个分类）：

     ```bash
     mkdir -p .agents/ADR/implemented/{class}
     mv .agents/ADR/proposed/{class}/{name}.md \
        .agents/ADR/implemented/{class}/{name}.md
     ```

   - 按 `.agents/ADR/AGENTS.md` 重写每份升格记录：
     - 将 `Status: proposed` 改为 `Status: implemented`。
     - 将 `## Proposal` 改为现在时态的 `## Decision`。
     - 将 `## Acceptance criteria` 和 `## Risks` 归并入 `## Consequences`（单步调试细节随 `.plan.md` 丢弃，不搬入 ADR）。
     - 同步修正实施中变动的客观事实（路径、符号名、默认值、实际依赖版本），并在最终报告中列出这些事实修订供 PR Review 核对；若核心决策本身改变，停下走替代决策流程。

3. **触发内联替代审查（调用 `mm-archive`）**
   - 加载并执行 `mm-archive` 对覆盖同一决策、机制或被否决备选方案的活跃 ADR 做局部替代审查：完全替代且无残留活跃约束的旧 `implemented/` 记录同变更迁入 `archived/`（或纯机械/小 UI 直接删除），部分替代则留在 `implemented/` 并补齐双向链接；一并处理明确被淘汰的 `proposed/` / `rejected/` 记录。

4. **全仓修复入站链接**
   - 对本次所有升格记录（`{name}.md`）及在替代审查中归档/删除的记录，分别按文件名全仓检索：

     ```bash
     grep -rn --exclude-dir=.git --exclude-dir=node_modules "{file}.md" . 2>/dev/null
     ```

   - 根据引用方所在目录更新相对路径（同目录用裸文件名，跨目录按相对层级计算；包括仍在 `proposed/` 中的其他 `.plan.md` 的 `Depends on:` / `Constrained by:`）。
   - 严禁修改 `archived/` 中的历史冻结记录；代码注释中的 `ADR <date>-<slug>` 不含路径，无需改动。

## 7. 汇报结果与收尾边界

向用户汇报：
1. 已完成步骤及每步 `Verify:` 的真实执行结果与覆盖范围。
2. `## Verification` 中已运行的自动检查结果，以及**待人工在 PR Review 时核验的检查清单**。
3. 交付收口情况（如已完成全部步骤）：已删除的 `.plan.md`、已升格至 `implemented/` 的 ADR、实施中同步修正的局部参数/事实（如有）、`mm-archive` 替代审查及归档/删除结果、修复的链接，以及由此变为 **Ready** 的后续 Plan。
4. 发现但按 `## Not in scope` 有意未修复的问题及原因。
5. 若未完成全量交付：明确剩余步骤、停止原因，以及继续前计划是否需要修订。

**红线**：除非用户明确要求，否则不要执行 `git commit` 或 `git push`——代码、升格后的 ADR 与随同归档的旧记录保留在工作区，由用户通过 diff / PR Review 统一验收把关。

## 8. 退出条件

满足以下任一情形即结束：
- **全量完成并收口**：所有步骤均已执行且 `Verify:` 全绿；关键约束代码已落注 `See ADR`；对应 `.plan.md` 已删除、全部已交付 `ADR:` 已按规范升格至 `implemented/`、内联替代审查与入站链接修复已完成；`## Verification` 中自动检查项已运行、人工检查项已列出供 PR Review 核验；工作区未自动提交。
- **部分执行或受阻停止**：已说明已完成步骤、停止原因（指定子集完成 / Stop point / 前提失效 / ADR 冲突 / 连续验证失败）及剩余步骤；`.plan.md` 与 `proposed/` ADR 保留在原位未升格，未完成或未通过项保持未勾选。
- **只读进度查询**：已核对并汇报已完成/待办步骤及人工核验状态，未改动工作区代码。
