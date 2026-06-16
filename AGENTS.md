# AGENTS.md — new-api 项目约定

## 概览

这是一个使用 Go 构建的 AI API 网关/代理。它通过统一 API 聚合 40 多个上游 AI 提供商（OpenAI、Claude、Gemini、Azure、AWS Bedrock 等），并提供用户管理、计费、限流和管理后台。

## 技术栈

- **后端**：Go 1.22+、Gin Web 框架、GORM v2 ORM
- **前端**：React 19、TypeScript、Rsbuild、Base UI、Tailwind CSS
- **数据库**：SQLite、MySQL、PostgreSQL（三者都必须支持）
- **缓存**：Redis（go-redis）+ 内存缓存
- **认证**：JWT、WebAuthn/Passkeys、OAuth（GitHub、Discord、OIDC 等）
- **前端包管理器**：Bun（优先于 npm/yarn/pnpm）

## 架构

分层架构：Router -> Controller -> Service -> Model

```
router/        — HTTP 路由（API、relay、dashboard、web）
controller/    — 请求处理器
service/       — 业务逻辑
model/         — 数据模型和数据库访问（GORM）
relay/         — AI API relay/proxy 及提供商适配器
  relay/channel/ — 提供商专用适配器（openai/、claude/、gemini/、aws/ 等）
middleware/    — 认证、限流、CORS、日志、分发
setting/       — 配置管理（ratio、model、operation、system、performance）
common/        — 共享工具（JSON、crypto、Redis、env、rate-limit 等）
dto/           — 数据传输对象（请求/响应结构体）
constant/      — 常量（API 类型、渠道类型、上下文键）
types/         — 类型定义（relay 格式、文件来源、错误）
i18n/          — 后端国际化（go-i18n、en/zh）
oauth/         — OAuth 提供商实现
pkg/           — 内部包（cachex、ionet）
web/             — 前端主题容器
 web/default/   — 默认前端（React 19、Rsbuild、Base UI、Tailwind）
  web/classic/   — 经典前端（React 18、Vite、Semi Design）
  web/default/src/i18n/ — 前端国际化（i18next、zh/en/fr/ru/ja/vi）
```

## 国际化（i18n）

### 后端（`i18n/`）
- 库：`nicksnyder/go-i18n/v2`
- 语言：en、zh

### 前端（`web/default/src/i18n/`）
- 库：`i18next` + `react-i18next` + `i18next-browser-languagedetector`
- 语言：en（基准）、zh（回退）、fr、ru、ja、vi
- 翻译文件：`web/default/src/i18n/locales/{lang}.json` — 扁平 JSON，键为英文源文本
- 用法：`useTranslation()` hook，在组件中调用 `t('English key')`
- CLI 工具：`bun run i18n:sync`（在 `web/default/` 目录下运行）

## 规则

### 规则 1：JSON 包 — 使用 `common/json.go`

所有 JSON marshal/unmarshal 操作都必须使用 `common/json.go` 中的包装函数：

- `common.Marshal(v any) ([]byte, error)`
- `common.Unmarshal(data []byte, v any) error`
- `common.UnmarshalJsonStr(data string, v any) error`
- `common.DecodeJson(reader io.Reader, v any) error`
- `common.GetJsonType(data json.RawMessage) string`

业务代码中不要直接导入或调用 `encoding/json`。这些包装函数用于保证一致性，并为后续扩展预留空间（例如切换到更快的 JSON 库）。

注意：`json.RawMessage`、`json.Number` 以及 `encoding/json` 中的其他类型定义仍可作为类型引用，但实际的 marshal/unmarshal 调用必须通过 `common.*` 完成。

### 规则 2：数据库兼容性 — SQLite、MySQL >= 5.7.8、PostgreSQL >= 9.6

所有数据库代码都必须同时完整兼容这三种数据库。

**使用 GORM 抽象：**
- 优先使用 GORM 方法（`Create`、`Find`、`Where`、`Updates` 等），而不是原始 SQL。
- 让 GORM 处理主键生成，不要直接使用 `AUTO_INCREMENT` 或 `SERIAL`。

**无法避免原始 SQL 时：**
- 列引用方式不同：PostgreSQL 使用 `"column"`，MySQL/SQLite 使用 `` `column` ``。
- 对 `group`、`key` 等保留字列，使用 `model/main.go` 中的 `commonGroupCol`、`commonKeyCol` 变量。
- 布尔值不同：PostgreSQL 使用 `true`/`false`，MySQL/SQLite 使用 `1`/`0`。使用 `commonTrueVal`/`commonFalseVal`。
- 使用 `common.UsingPostgreSQL`、`common.UsingSQLite`、`common.UsingMySQL` 标志分支处理数据库专用逻辑。

**没有跨数据库 fallback 时禁止使用：**
- MySQL 专用函数（例如没有 PostgreSQL `STRING_AGG` 等价实现的 `GROUP_CONCAT`）
- PostgreSQL 专用操作符（例如 `@>`、`?`、`JSONB` 操作符）
- SQLite 中的 `ALTER COLUMN`（不支持，应使用新增列的变通方式）
- 没有 fallback 的数据库专用列类型，JSON 存储应使用 `TEXT` 而不是 `JSONB`

**迁移：**
- 确保所有迁移都能在三种数据库上工作。
- 对 SQLite，使用 `ALTER TABLE ... ADD COLUMN`，不要使用 `ALTER COLUMN`（模式见 `model/main.go`）。

### 规则 3：前端 — 优先使用 Bun

前端（`web/default/` 目录）优先使用 `bun` 作为包管理器和脚本运行器：
- `bun install` 用于安装依赖
- `bun run dev` 用于开发服务器
- `bun run build` 用于生产构建
- `bun run i18n:*` 用于 i18n 工具

### 规则 4：新渠道的 StreamOptions 支持

实现新渠道时：
- 确认该提供商是否支持 `StreamOptions`。
- 如果支持，将该渠道加入 `streamSupportedChannels`。


### 规则 5：上游 Relay 请求 DTO — 保留显式零值

对于从客户端 JSON 解析后再重新 marshal 给上游提供商的请求结构体（尤其是 relay/convert 路径）：

- 可选标量字段必须使用带 `omitempty` 的指针类型（例如 `*int`、`*uint`、`*float64`、`*bool`），不要使用非指针标量。
- 语义必须是：
  - 客户端 JSON 中字段缺失 => `nil` => marshal 时省略；
  - 字段显式设置为零值/false => 非 `nil` 指针 => 必须仍然发送给上游。
- 避免对可选请求参数使用带 `omitempty` 的非指针标量，因为零值（`0`、`0.0`、`false`）会在 marshal 时被静默丢弃。

### 规则 6：计费表达式系统 — 阅读 `pkg/billingexpr/expr.md`

处理阶梯/动态计费（基于表达式的定价）时，必须先阅读 `pkg/billingexpr/expr.md`。它记录了设计理念、表达式语言（变量、函数、示例）、完整系统架构（编辑器 -> 存储 -> 预扣费 -> 结算 -> 日志展示）、token 归一化规则（`p`/`c` 自动排除）、额度转换和表达式版本管理。所有对计费表达式系统的代码变更都必须遵循该文档中的模式。

### 规则 7：Pull Request — 适当标识 AI 生成贡献

创建 pull request 时：

- 先比较当前 git 用户（`git config user.name` / `git config user.email`）和仓库历史核心开发者（例如 `git log` 中反复出现的主要作者）。不要修改 git config。
- 如果当前 git 用户不是这些历史核心开发者之一，必须在 PR 正文中明确说明代码由 AI 生成或 AI 辅助生成。
- 起草 PR 标题/正文时，始终使用仓库 PR 模板 `.github/PULL_REQUEST_TEMPLATE.md`。保留模板结构，并填写相关部分，不要替换为临时格式。
