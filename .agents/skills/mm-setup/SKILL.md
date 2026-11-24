---
name: mm-setup
description: 配置仓库，使编程 agent 在 .agents/ADR/ 下以 ADR 形式记录决策（安装 ADR 规范并在 AGENTS.md 中添加入口指引）。适用于初始化仓库、用户询问决策/ADR/设计文档应放在哪里（如「决策记在哪」「ADR 放哪」「记一下这个决定」「setup ADR」），或 AGENTS.md 存在但未说明如何记录决策时。
disable-model-invocation: true
---

# Setup · 初始化决策记录

每个仓库只需运行一次：将 ADR 规范安装到 `.agents/ADR/`，并在根目录 `AGENTS.md` 中写入入口指引。不创建示例 ADR，也不猜测项目技术栈。

## 设计目的

代码只体现**选了什么**，不体现**为什么选**和**排除了什么**。缺少书面决策记录时，agent 每次开启新会话都会重新推导同一问题，甚至推翻既有结论。`.agents/ADR/` 与 `.agents/skills/` 并列，随仓库版本化流转，不绑定特定 agent 工具。

## 执行流程

1. **定位仓库根目录**

   ```bash
   git rev-parse --show-toplevel
   ```

   命令失败说明当前不在 git 仓库中；写入任何文件前，先向用户确认目标根目录。

2. **检查现有入口文件**

   - 若根目录存在 `AGENTS.md`，先通读全篇，记录现有的文档路径、命名规范与语言约定。若与 ADR 规范冲突，先询问用户以哪方为准，禁止静默覆盖。
   - 若不存在 `AGENTS.md` 但存在 `CLAUDE.md`，询问用户是新建 `AGENTS.md`、写入 `CLAUDE.md`，还是两者同步写入。

3. **创建目录**

   ```bash
   mkdir -p .agents/ADR
   ```

4. **安装规范文件**

   源文件为当前 skill 目录下的 `references/adr-standard.md`（按 skill 所在路径解析，而非项目路径）：
   - `.agents/ADR/AGENTS.md` 不存在 → 直接复制过去。
   - 已存在且内容完全一致 → 跳过，汇报「已安装」。
   - 已存在但内容不同 → 展示 diff 并询问用户处理方式。仓库可能有意收紧了规范，绝不擅自覆盖为默认版本。

5. **写入入口指引**

   在目标入口文件（根目录 `AGENTS.md`，或第 2 步确认的文件）中写入以下区块：

   ```markdown
   <!-- BEGIN: decision-records -->
   ## Decision records

   Decisions live in `.agents/ADR/`, one file per decision, path-encoded as
   `{proposed|implemented|rejected|archived}/{architecture|feature|bug-fix|design|process}/yyyy-mm-dd-title.md`.
   Read `.agents/ADR/AGENTS.md` before writing or changing one.
   <!-- END: decision-records -->
   ```

   - 起止标记已存在 → 仅替换标记之间的内容，保留标记本身。
   - 文件存在但无标记 → 末尾空一行后追加。
   - 文件不存在 → 新建文件并仅写入该区块。

   该区块刻意保持极简：入口文件每次会话都会加载，只保留路径约定与读取指针；完整规范按需再读 `.agents/ADR/AGENTS.md`。

6. **配置 `.rgignore` 检索隔离**

   确保仓库根目录 `.rgignore` 包含 `.agents/ADR/archived/`，防止过时的冻结历史快照污染日常全局检索（显式指定目录时仍可检索）：
   - 文件已存在且包含 `.agents/ADR/archived/` → 跳过。
   - 文件已存在但未包含 → 末尾追加一行 `.agents/ADR/archived/`。
   - 文件不存在 → 新建 `.rgignore` 并写入 `.agents/ADR/archived/`。

7. **汇报结果**

   列出所有涉及的文件路径及对应操作（新建、追加、替换或跳过）。除非用户明确要求，否则不要编写示例 ADR。

## 退出条件

- `.agents/ADR/AGENTS.md` 已就位且与标准一致，或用户明确保留自定义版本。
- 目标入口文件中恰好包含一个起止标记完整的 `decision-records` 区块，且文件其余内容未被改动。
- 根目录 `.rgignore` 已排除 `.agents/ADR/archived/`。
