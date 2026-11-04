# 词轮：源码、环境与数据迁移说明

## 本次交付是什么

这是原站源码 `dd7b7c749a2bcf68a4cfc5314cfdb3b1e69efea7` 的独立副本，保留原 UI、学习规则、稳定词 ID、全部三个 schema 迁移、前后端核心、词库、音标、测试、依赖锁和来源许可。只补本机 Node24 环境声明、可重复本地迁移命令和移交说明，不会更新或停止原站。

推送到 GitHub 只是保存代码和快照，不会自动搬走 Cloudflare 数据库、迁移域名、开通服务器、复制 API key 或替换原站的后台任务。本项目不是静态 GitHub Pages 网站。

所有者已明确同意将个人学习快照公开。即使随后将仓库转为私有，也不能收回别人已经克隆的文件或 Git 历史。后续新学习数据仍应走私人备份，不要顺手提交。

## 一、从干净 Git 克隆启动完整本机界面

需要：Git、Node **24.22.1**、npm，以及可读写的本机工作目录。可使用 nvm 按根目录版本文件安装，也可自行安装相同 Node 版本。构建、数据库、恢复工具使用 Node 内建 SQLite，不需另装数据库服务器。

```bash
git clone https://github.com/rongyan-123/words-memory.git
cd words-memory
nvm install
nvm use
npm run install:ci
npm run db:migrate
npm run dev -- --port 4173
```

打开 `http://localhost:4173`。默认没有 AI key，使用明确标识的离线回退，不产生模型费用。不要同时启动两个占用同一端口的服务。

`npm run install:ci` 是仓库内的 portable 安装入口，调用锁定依赖的 npm CI，包含 dev/optional 依赖，不依赖外部 Sites 插件。若本机 npm 缓存目录不可写，可自行指定一个可写目录，例如 `npm_config_cache=/tmp/words-memory-npm-cache npm run install:ci`。网络/CPU 原生依赖受操作系统和平台支持范围限制，本次验证平台为 Linux x64。

本地开发/构建/启动包装器会将未显式设置的 `XDG_CONFIG_HOME` 指向被忽略的 `.sites-runtime/config`，避免新容器中 Wrangler 试图创建不可写的全局 home 目录；这只影响当前工具进程，不改机器设置或复制已有登录凭据。

若容器已经预设了一个不可写的 `XDG_CONFIG_HOME`，包装器会尊重该显式值，不悄悄改掉它。此时在该命令上自己指定本地目录，例如 `XDG_CONFIG_HOME="$PWD/.sites-runtime/config" npm start -- --port 4173`（开发模式同样可加该前缀）。这是本次受限 Linux 容器的启动验证所用设置，不要求写入或更改全局 home。

`npm run db:migrate` 只使用 `wrangler.local.json` 的占位 DB ID、`./drizzle` 和本仓库 `.wrangler/state`。按迁移账本只运行未执行的 SQL，重复运行无操作，拒绝所有附加参数。它没有 `--remote` 或数据库 URL 功能。原来手工应用过 DDL、却没有 `d1_migrations` 账本的本机库可能报“表已存在”；不要删除旧库或手工伪造账本来绕过，先备份并另行处理。

新库最初只有 224 个原创词，**不会自动装入扩展词库或个人历史**。其余 3742 个词已经完整放在 `public/lexicons/final-import.json`，可在运行中的本机应用设置中导入该 JSON，或在另一个终端执行下面的显式本机请求：

```bash
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync('public/lexicons/final-import.json', 'utf8'));
const response = await fetch('http://localhost:4173/api/v1/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ kind: 'lexicon', data }),
});
const result = await response.json();
console.log(result);
if (!response.ok || result.total !== 3966) process.exitCode = 1;
JS
```

实际成功响应字段以 API 为准；成功导入应显示 3742 个新增词、合计 3966 词。稳定 ID 让重复导入保持同一词，不创建第二份学习记录。这不是导入个人学习快照。源成员映射和清理报告随词库保留，不需再次下载上游 770,611 行词典才能启动或构建。

## 二、检查、构建与构建结果运行

```bash
npm run typecheck
npm test
npm run test:setup
npm run build
npm start -- --port 4173
```

`npm start` 启动构建结果的本地 Wrangler，仍使用 `.wrangler/state`。它不是公网服务器配置或 Cloudflare 正式发布。首次先执行 `db:migrate`。普通开发与构建预览共用同一个占位 DB ID，所以本机学习记录留在同一项目的本地数据库中。

构建前会重建三个独立灾备工具和源树元数据。元数据记录 Git 基点，所以从 Git 克隆可直接构建；只有 ZIP 源文件、没有 `.git` 时，应先 `git init`、提交源码，再构建。`baseCommit` 指构建前提交，不应误认为随后提交/发布的 ID。检查和构建不需要 AI key，也不读取生产数据库。

不要每次运行 `db:generate`：它是开发者为有意新增 schema 生成新迁移的命令，不是安装、恢复或启动步骤。已经部署的 `0000` / `0001` / `0002` SQL 均不可修改。

## 三、环境变量与密钥

- 无密钥就能运行离线回退。没有 `NEXT_PUBLIC_*` key，也没有付费语音服务。
- Node API 可复制 `.env.example` 为被忽略的 `.env`；`npm run start:node` 用 Node 内建 `--env-file-if-exists=.env` 加载它。
- 本机完整 UI 的 Worker 可复制 `.dev.vars.example` 为被忽略的 `.dev.vars`，仅在自己明确想付费调用 AI 时填入自己的 `DEEPSEEK_API_KEY`。不填不影响本机学习与导入。不要把任何真实值放到 `public/`、源码、README、hosting.json、GitHub commit 或问题日志。
- DeepSeek 端点、Flash 模型、reasoning low 由现有 provider 固定；没有允许浏览器自选 host/model 的接口，没有输出 token 人为截断。90 秒超时和结构校验保持原样。设置 key 后，打开页面或后台 tick 可能自动规划并消耗账户额度。
- 正式 Sites key 应继续由宿主服务端 runtime secret 配置。GitHub 仓库不会携带或自动迁移它，也不应把宿主访问 token 当应用环境模板。
- `NODE_HOST`、`PORT`、`VOCAB_DB_PATH` 仅给可选 Node API 用，不改变完整 UI 的本地 D1 路径。

## 四、可选 Node24 / SQLite API

```bash
cp .env.example .env
# 可在 .env 取消注释 VOCAB_DB_PATH，选择一个自己控制且可写的持久路径。
npm run start:node
```

此服务默认仅 `127.0.0.1:8788`，是 **API-only**，不提供 React 页面、静态资源或跨域前端接入。默认数据库 `/tmp/vocab-wheel.sqlite` 可能在系统清理/重启后丢失；需要持久化时显式指定磁盘路径，不能把 `/tmp` 当长期备份。

Node adapter 按原始 SQL 和 checksum 建表；数据库与完整 UI 的 `.wrangler/state` 分开。Node 默认命名空间 `local-owner`，原站/完整 UI 为固定 `site-owner`。现有启动器没有不安全的请求头/查询参数 owner 切换，也没有公网鉴权。不能简单启动它就读到恢复后的 `site-owner` 行，更不能直接绑定 `0.0.0.0` 或裸露公网。

## 五、个人历史快照与可验证恢复

完整历史数据在 `migration/disaster-backup.zip`。快照时间、计数、内容哈希、ZIP 哈希、可信工具哈希及隔离恢复结果见 `migration/README.md` 和 `migration/verification.json`。该归档含：

- 11 张应用表的精确列、主键、建表语句、原始行和逐表哈希；学习阶段、难度、冻结日期、预留和去重日志都在其中。
- 224 个原始 seed 词和场景、3 份不可变 SQL、schema 版本、历史源码指纹。
- 已验证的初始 legacy 基线和三个无需 node_modules 的 Node24 工具。

**不包括：** 未同步到服务器的浏览器 outbox、实际 API key、账户/Sites/Space/GitHub 凭据、云账号、域名控制权、站外自动任务。克隆新电脑也不会从旧浏览器自动取回离线队列。

仅查看/验证可以运行：

```bash
node scripts/verify-backup.mjs --new migration/disaster-backup.zip --old migration/disaster-backup.zip --legacy-baseline migration/disaster-backup.zip
node scripts/restore-backup.mjs --snapshot migration/disaster-backup.zip
```

第一条应为 `unchanged`；第二条是**隔离恢复演练**：只在全新随机临时 SQLite 导入全部行、检查完整性，随后删除临时目录。它不是“把历史恢复进当前正在运行的应用”，不会改生产或本机应用数据库。

真正持久迁移还需另行实现/审核适配目标的恢复流程：暂停目标写入、保留原目标备份、建立独立新库、应用已核验 SQL、参数化逐表插入原始行、核对 11 表与幂等账本、使用可信服务器 `site-owner` 命名空间、处理旧客户端待确认请求，最后才切换服务。不能把普通 `/api/v1/import` 合并恢复当作完整恢复；它不会还原所有冻结计划、预留和去重账本。本交付**不声称已经提供或验证一键持久生产恢复**，也没有执行此步骤。

## 六、正式部署与后台任务

原站运行于 Sites 提供的 Cloudflare Workers / D1，应用在收到请求前依赖平台的 owner-private 认证。`.openai/hosting.json` 仍保留原项目 ID 及 `DB` 绑定声明；这个 ID 不是授权凭据，也不会让克隆者获得部署或数据库权限。不得把副本当新账号项目直接覆盖原站，或把本地占位数据库 ID 当真实远程数据库。

如果继续原站，使用其受支持的 Sites 发布流程和私人 audience；GitHub 推送本身不会发布。如果迁到自己的 Cloudflare/Node 服务器，需配置真实 D1/存储并补独立认证、逐请求授权、TLS、持久卷和恢复流程，不能公开部署当前单人命名空间的原始 Worker。当前工程没有完整的自管云 IaC、Docker 服务编排或 GitHub 一键生产部署工作流。

每日滚动规划的入口是 `POST /api/v1/planning/tick`（JSON `{}`），每次最多准备一天，按 `hasMore`、`pending`、`retryAfter` 处理。页面开启时补齐窗口不能代替关闭页面后的计划任务。现有每日规划与固定 Space 归档由站外授权任务运行；它们的实际调度、接收文件、服务凭据和外部 pin **不随 Git 自动建立或迁移**。

换宿主时需重新设置服务授权和任务，保留固定备份文件的身份与防覆盖校验规则，不复制 token 到本仓库。迁移文档描述接口契约，不宣称副本已经拥有运行中的定时任务。

## 七、许可和范围

见 `THIRD_PARTY_NOTICES.md`。保留全部词库、IPA、构建插件、vendored 样式的许可全文和来源。ECDICT 依其仓库 MIT 声明分发，但混合上游没有完成逐项权利审计；不把这个子集描述为官方考纲、完整词典或任意商用已清权数据。

`node_modules`、缓存、构建结果、QA fixture、机器执行配置、个人新增导出和实际环境文件都被忽略。它们不是可移植源码或可信生产备份。依赖锁、构建源码、完整项目词库与明确授权的历史灾备包已经随仓库提供。
