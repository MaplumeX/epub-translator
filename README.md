# 墨页 · EPUB 双语翻译工作台

面向个人精读与校对的本地 EPUB 翻译 Web 应用（外语 → 简体中文），支持英文小说与技术书的结构保真翻译、可选全书预扫描建档（7C-Lite）、断点续传、原地校对与双语/纯译文双模式无损导出。

## 核心特性

- **EPUB 2/3 结构保真**：完整解析 OPF 元信息、Spine、`toc.ncx` 与 EPUB 3 `nav.xhtml`；跳过 `<pre>` 代码块，以受控编号占位符保护内联 `<code>`、MathML/SVG 公式、`<em>`/`<strong>`/`<a>` 与脚注引用；导出保证首条目为无压缩 `mimetype`。
- **7C-Lite 翻译管线**：默认以章节内批量分块 + 前 2–3 段滑动上下文 + 占位符严格校验 + 异常自动降级单段重试的 1x 快路径运行；长篇小说可一键开启「全书预扫描」提取人物/术语表与每章 2 句摘要。
- **本地安全与断点续传**：服务端仅监听 `127.0.0.1`，使用 Node 24 内置 `node:sqlite` 每块落盘，支持暂停、刷新与重启恢复；支持多组 OpenAI 兼容 Provider 预设（OpenAI / DeepSeek / Ollama / 自定义）与连通性测试。
- **双模式导出与两栏校对**：支持「双语对照」与「纯译文」实时预览与导出，提供失败段筛选、原地编辑与附指令单段润色重译；内置温润纸质书稿感浅色 / 暖炭黑深色双模式。

## 环境要求

- Node.js `>= 24`（使用内置 `node:sqlite`，无需编译原生扩展）
- `pnpm`

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. （可选）复制环境变量模板作为首次启动的默认 Provider 种子
cp .env.example .env

# 3. 开发模式（并行启动 Hono 后端 127.0.0.1:3456 与 Vite 前端 127.0.0.1:5173）
pnpm dev
```

### 生产单端口启动

```bash
pnpm run build
pnpm start
# 浏览器访问 http://127.0.0.1:3456
```

## 测试与检查

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm run build
```

## 目录分层

- `src/core/` — 纯 TypeScript EPUB 引擎与 7C-Lite 翻译管线（零 React/Hono/SQLite 依赖，可独立复用于 CLI）
- `src/server/` — `127.0.0.1` Hono HTTP/SSE 服务、`node:sqlite` 持久化与任务调度
- `src/web/` — React + Vite 两栏校对工作台与设计系统 Token（详见 [DESIGN.md](DESIGN.md)）
- `data/` — 运行时 SQLite 数据库与只读原书副本（已列入 `.gitignore`）
