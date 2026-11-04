# 词轮 · Day by day

个人用的整组英语背词列表。进入就是 **Day N**：灰色词行、左侧英语/音标（词库有时）、右侧中文遮盖，点击立即揭晓。没有首页仪表盘。计划、词库、备份等收进左上角设置。

这是原站源码的独立迁移副本，源版本为 `dd7b7c749a2bcf68a4cfc5314cfdb3b1e69efea7`。完整的本机运行、词库装入和部署边界见 [MIGRATION.md](MIGRATION.md)，依赖与数据许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

**公开数据提醒：** 所有者已明确同意将 `migration/disaster-backup.zip` 中的个人学习记录随本仓库公开。它是 **2026-11-04T02:39:25.768Z** 的历史服务端快照，不是实时数据库，也不含设备未同步操作。克隆或启动项目不会自动恢复这份记录。网站本身仍必须保持私人认证边界，不能因为仓库公开而将原服务裸露公网。

## 自动保存、难词标记和学习流程

- 一整天列表一次取回；揭晓/隐藏、搜索、滚动纯本地，不会把“看过”误认为“记住”，计时器也不替用户评分。
- **点左窄条每次难词 +1**，红色随次数加深（视觉深度饱和，但实际次数继续累计）。这是跨日期、按 wordId 保存的独立难度历史。
- 可学习的当天/历史页中，点难词还会记录“忘记”；连续重复点击只逐次累加难度，不反复制造同样的记忆评分。未来预览可以标难度，但绝不提前写学习记录。
- **右滑露“标记 −1”**，最小 0；**左滑露“熟知”**明确记录记住，不抹掉已有难度历史。仅滑开操作栏不会写任何数据，垂直滚动不触发标记；键盘左右方向键可打开操作，Esc 关闭。
- 每个操作先同步写入本机不可变 outbox，成功才乐观显示。约 **900ms** 合并网络提交，不每点一下就请求。每 **60 秒**、重新上线、重新可见、失焦和换页都会尝试同步。
- 请求进行时可继续点，新操作有自己的 ID。服务器操作幂等，确认只移除对应 ID，旧响应不吞后来操作。丢 ACK / 刷新后重用原包，标记基线防止次数重复显示。
- 后台/关闭时用 keepalive 做最佳努力；不能承诺浏览器强杀时立即上传。未确认包不清除，下次打开重试。小状态只显示“已暂存 / 同步中 / 已保存 / 离线待同步”，不每次弹保存 toast。
- 同源页面用 **Web Locks 独占编辑**，另一个标签页只读等待；原编辑页关闭后自动读取最新队列接续，避免两份 localStorage 缓存互相覆盖。不支持安全锁的浏览器保守只读，不伪称跨页合并安全。
- 默认一天一页，可自定每页 1–200 词；0 表示整天。显示分页不改变 AI 新词数。卡片普通手机行高约 60–63px，长中文自然扩展，不固定裁字。
- 1 / 3 / 7 天仍按**真实首次学习日**、北京时间日历计算。记忆评分每日每词最多 3 次，难度点击次数不受此限制。逾期去重且不在一天跳过多个阶段。
- 新动作按点击当日创建评分，保留老请求原日期不改写；跨午夜不会用昨天待确认的“忘记”压制今天的新复习。
- V4 的 pending batch / draft 会读取、按原 batchId 重放并清理后再继续新队列，不因升级换 key 遗弃。服务端明确拒绝“完成今天”（如新增复习尚未标记）时只撤掉未执行的完成意图，保留评分与难度操作。

## AI 与程序各自负责什么

**AI 只做语义挑选**：从未学且未预留的真实词库里选择相关单词，组成连贯任务。没有旧的 6–14 词配额，也不按页面数量裁掉选词。如果一次选了 32 个有效词，当天就保留 32 个，再加程序算出的复习词。

**程序负责全部状态与排期**：有效词条校验、首次学习日、复习阶段、日期分配、库存、未来预留、跨页去重。AI 没有记忆数据库写权限，预取也绝不等于学过。

运行时为官方 **DeepSeek Flash + reasoning low**。不设置 `max_tokens` / `max_completion_tokens` 或人为输出 token 预算；使用官方默认输出容量。请求 90 秒超时、响应封装安全上限 2MiB，最终计划按应用结构校验；不读取、保存、返回或日志打印思考正文。仅记录白名单错误类别、HTTP 状态、finish_reason 和数字用量。

缺少密钥、网络失败或无效模型输出时，会明确标记为非 AI 精选语义场景，不冒称真实生成。

## 10 天计划、3 天滚动预取

设置默认新词计划 10 天，范围 1–365 天，起始日期首次创建后固定。

1. 先准备 1–3 天。
2. 第 3 天明确完成，或日历进入第 4 天，才准备 4–6 天。
3. 依此滚动，最多预先准备当前 3 天，而不是一口气生成全部。
4. 用户手动翻到未生成页，可点“生成这一天”；已生成页冻结保存，不能靠刷新或旧 regenerate 入口重新收费/改词。
5. 计划天数只是**新词生成期**，不是复习终点。结束后仍按日历进入当天的复习页；已经冻结的页、1/3/7 复习与学习进度不因缩短新词计划而删除。

D1 的 owner 全局 lease（105 秒）串行化生成，先获得 lease 再读取库存。日期计划与单词预留事务提交，唯一 `(owner, wordId)` 约束防止不同日期重复排新词。过期 lease 不能提交或释放后来请求的 lease。

旧版本当日计划会安全接入，已在今天学过的词仍留在整天列表，不丢记录或把列表缩成剩余几词。旧 0000 数据表继续保留；新功能通过追加 0001 迁移建立。

## 关闭网站后的每日任务

页面打开时会自动补齐当前窗口；遇到其他生成 lease 会只读轮询状态，清除后继续，不重复发收费请求。**这不代替关闭站点后的每日自动任务**。

部署拥有者应通过原生 Sites 服务访问授权配置每日任务（例如 Asia/Shanghai 02:00）：

```text
POST /api/v1/planning/tick
Content-Type: application/json
{}
```

每次最多一次模型调用 / 一天生成。返回：

```json
{"generatedDay":1,"hasMore":true,"missingDays":[2,3],"pending":false,"currentBatch":[1,3],"planning":{}}
```

任务最多补齐当前 3 天；`hasMore:false` 即停止。`pending:true` 或 `retryAfter` 未到时只读 `GET /api/v1/planning/status`，等待现有 lease / 退避结束再继续，不盲目重试模型。窗口已足够、或新词计划结束时 tick 为无收费 no-op。显式生成一个未来新词日可发送 `{"day":5}`。

原生授权凭据由部署/自动化平台获取，**不写进仓库、网站前端或任务说明**。当前源码仅实现该接口，不代表原生每日任务已经创建；应以父任务返回的调度状态为准。

## API

所有接口在当前 owner-private Site 的同一单人命名空间下工作，返回 `Cache-Control: no-store`。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/bootstrap` | 词库、进度、设置、日历/滚动窗口摘要 |
| GET | `/api/v1/day?day=3` 或 `?date=2026-11-02` | 一整天的新词与复习列表、进度、可否评分 |
| GET | `/api/v1/planning/status` | 轻量只读规划状态 |
| POST | `/api/v1/planning/tick` | `{day?:number}`，至多生成一天 |
| POST | `/api/v1/marks/batch` | `{operations:[{opId,wordId,delta:1或-1}]}`，≤200次操作，逐次去重、顺序执行、零下限 |
| POST | `/api/v1/reviews/batch` | `{batchId,day:'YYYY-MM-DD',ratings:[{wordId,grade}],dayCompleted}` |
| PUT | `/api/v1/settings` | 保留兼容字段并新增 horizonDays / pageSize（0 = 整天） |
| GET | `/api/v1/export` | v3 备份：词库、来源、进度、难度次数、设置及规划摘要 |
| GET | `/api/v1/disaster/export` | 只读、完整一致性灾备快照：11 张应用表、词库、迁移与版本指纹 |
| POST | `/api/v1/import` | `{kind:'lexicon'|'progress'|'backup',data}` |

`dayCompleted` 不会代替用户选择；只有当天全列表已明确评分才接受。未来页只能预览。过去页可再次学习，记忆日期取真实服务器今天；跨天重放先做幂等检查，未提交的旧 outbox 不会错误完成过去日期。

旧 `/plan` 与 `/review` 保留兼容：前者收敛到新的冻结计划，不再走另一个生成配额/重排流程；后者仍做事件幂等评分。新 UI 不使用逐词 `/review`。

## 词库与备份

- 内置 **224 个原创英汉词条 / 16 个真实任务场景**：通用表达、服务器、SSH、网络、GPU 云计算、模型与技术沟通。**不是完整或官方四级词库**；不冒称逐词核验官方考纲。可导入自己有权使用的四级词库。
- 原创释义和例句以 CC0-1.0 提供，见 `src/data/PROVENANCE.md`。未捆绑来源未审清的第三方整部词典。
- JSON：`{words:[...],scenes:[...]}`。保留稳定 id 与 source。内置词条 ID 不可覆盖。
- CSV 至少 `term,meaning`；可选 `id,phonetic,partOfSpeech,example,exampleZh,tags,sceneIds,source`。多标签/场景以 `|` 分隔；缺 ID 时生成稳定导入 ID；sceneIds 会生成同名场景。自定义标题/任务建议 JSON。
- 单次词库数据至多 5MiB，累计自定义内容至多 **3MiB / 10000 词 / 1000 场景**，先达到者为限。完整备份至多 **8MiB**。导入先校验再写入。
- v1/v2/v3 备份都可恢复。按 ID 合并，不删除未列出记录；相同 ID 进度采用备份值；v3 难度按快照恢复（不重放点击、服务器版本递增），v1/v2 不覆盖已有难度。规划摘要仅参考，不冒认备份的 AI 来源或覆盖当前冻结/预留；新环境根据真实进度重新准备未来页。内置稳定 ID 随应用提供。
- 音标为不改写学习词条的独立展示层：218/224 个内置词有固定来源的美式 IPA（ipa-dict / CMUdict，独立 MIT/CMUdict 许可，非原创 CC0）。完整来源与许可见 `src/data/PRONUNCIATION_SOURCES.md` 和 `/licenses/pronunciation-data.txt`。原始多种读法保留，默认一条，独立的 `+N` 按钮只展开/收起其他词典读法，不播放或切换声音；可能含词性或地域差异，不声称是唯一读法。导入词条已有 `phonetic` 优先且不猜口音；resolver、hostname、runtime、namespace、GPU、checksum 暂缺可靠音标，明确显示待补，不猜读法。点击单词、音标或喇叭使用设备的浏览器合成语音，不是词典真人录音。
- 音标静态映射没有写入 `seed.ts`、持久化词库或数据库；原始 seed 指纹和旧完整备份工具 pin 不变。UI 展开/收起音标不评分、不改难词次数、无单词级网络查询。原版数据/历史学习可由同一个旧灾备校验器继续验证；新构建只正常改变代码指纹。

### 合成朗读的能力与失败反馈

播放使用浏览器 / 系统的 Web Speech API，无新增服务端发音接口、付费语音服务、AI 调用或密钥。朗读输入始终是英文词形，不把 IPA 字符串当作可强制执行的发音指令；例如 `record` 的名词/动词异读不能保证逐项对应，设备提供的声线及口音也可能不同。`+N` 仅查看词典读法，与播放是独立按钮，不能把展开误称为“选择了该读音”。

`src/client/speech.ts` 保留当前 utterance 引用，优先选可用 `en-US`，否则选其他英语声线。初次语音列表为空可由浏览器按 `en-US` 尝试，后续 `voiceschanged` 刷新；明确只有非英语声线时给出提示，不悄悄换成中文声音。缺 API/构造器、同步抛错、异步语音错误或约 10 秒未启动均有失败反馈；快速换词取消旧任务并忽略迟到回调，翻页、换日、页面隐藏和卸载时清理。上述事件不会产生评分、难词标记或服务端写入。

`speak()` 只把任务排入队列，不能凭其返回值宣称播放成功；图标状态依据引擎事件，不代表检测到了扬声器声音。浏览器静音、设备音量、系统语音包或语音服务网络仍可能影响可听效果，本应用不能直接检测实际音量或保证每个词典变体。API 边界见 [Web Speech 规范](https://webaudio.github.io/web-speech-api/#tts-section)、[MDN 错误事件](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/error_event)及[语音列表更新](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event)。

### 四级主干与技术扩展（显式导入）

本次扩展不改原 224 词、16 场景、稳定 ID、既有三天冻结页或学习进度，也不需要新数据库迁移。ECDICT 固定 `ab22ad36302cafc6349a050e2b60894855208055` 的精确 `cet4` 标签含 3849 原始成员，经三项已审查拼写/变体映射成为 3847 个学习词形；129 个与原词共用原 ID。再加 CNCF 选词与原创简释，共 **3966 词**，不是“3966 词十天背完”的承诺，更不是官方完整考纲。

- 正式新词文件：`public/lexicons/final-import.json`，**3742 新词 / 2 个新自定义场景 / 1101829 字节**，SHA256 `5c531442ccbfbd09d225ecc4340dc2444dcdc29cb9623b68f9106809ffa72c26`。CET4 场景含完整 3847 个成员，云原生场景含 25 个成员；其中可引用原 seed ID，但不重写 seed 词或原场景。
- `POST /api/v1/import`，JSON 为 `{ "kind":"lexicon", "data": /* final-import.json 的解析对象 */ }`。平台 owner-private 服务权限由外部调用方取得，凭据不写入文件。站点不会自行从 URL 导入，也不会在 GET、打开页面或后台 tick 时自动导入这份数据。
- 核心 `validateLexiconImport(value, knownWordIds=[])` 仅接受服务端显式提供的当前 owner 既有 ID，才允许新场景引用旧词。请求体中的同名字段不授信；未知或其他 owner 的 ID 仍拒绝。普通导入和 v3 备份恢复都走该校验。
- 仓库用同一事务、分块参数化 upsert 写完整词库。重复同一文件复用 ID，不重学、不清难词或历史请求账本；失败整批回滚。已生成日期绝不重新生成，新词只进入尚未生成页的候选库存。生产导入前应另抓**最新**完整快照，不能把早期升级基线冒充用户的当前状态。
- `lexicon-expansion.ts` 的 130 个静态覆盖只补标签/并列义项/来源：129 个 CET4 交集及 runtime 技术语境。原场景义保持原文，新增通用义、词典 `[计]` 候选义分开；runtime 后补简释不替换原卡。原 GPU 保留图形处理器义，未引入 ECDICT 无关的 ground-power 义。host/thread 使用实际 `ec-` ID。
- 608 个 `[计]` 候选中 603 个属于 CET4；它们是原词典领域标记，不等于现代云计算含义已核实。CNCF 只用术语和链接，中文简释原创；不是已给所有词完成 AI 语义分类。AI 按天在可用 ID 中分组，程序继续管理日期、预留、去重和复习。
- 新大库采用有限候选上下文与确定性轮转，优先四级/技术交集，同时保留通用四级覆盖，不永远截取字母表前 200 或只发原 224。200 是单次上下文安全边界，不是强制每日学习数量；保留原时间/复习负载参考区间，不自动改用户计划天数或付费对全库逐词标注。
- AI 缺失/失败时仍优先使用已有小型真实任务；若只剩大型来源词表或未分组词，按原时间参考区间推进小段，明确标为“非 AI 语义分组的词库练习片段”，不把字母顺序片段伪装成 AI 任务，也不因失败一次推送 200 词。真 AI 选出的完整语义组不受该离线分段规则限制。
- 原始 seed 指纹、schema 和三个独立灾备工具 pin 保持不变；新增词与完整场景实际保存到 `custom_lexicon`，完整灾备会带走，而不是只在浏览器展示。导入后的冻结计划必须引用数据库中可恢复的真实场景成员，不能只在运行时虚构成员。

来源/许可边界见 `src/data/LEXICON_EXPANSION_SOURCES.md`、`/licenses/ecdict.txt`；ECDICT 仓库 MIT 声明不等于混合上游材料已完整清权，当前仅用于已披露的个人试用。ECDICT 传统音标原样保留、未统一口音，不冒称全部美音。源成员到学习 ID 的映射与三项清理证据随 `/lexicons/source-member-mapping.json`、`/lexicons/cleaning-report.json` 保存，manifest 记录内容哈希。构建本身不下载词典；重建需显式运行 `node scripts/prepare-expanded-lexicon.mjs --source-dir APPROVED_DIRECTORY`，核对冻结的两个源哈希后才写生成文件。

### 完整灾备与固定 Space 归档

`/api/v1/export` 是方便迁移的 v3 状态导出，**不是完整数据库备份**：导入会合并数据、重新规划，不恢复全部冻结计划、预留或历史幂等账本。新增 `GET /api/v1/disaster/export` 直接只读 `DB`，不建立默认行、不调用 AI，在同一个 D1 batch 中捕获以下 11 表：`user_state`、`word_progress`、`review_events`、`daily_plans`、`custom_lexicon`、`plan_config`、`scheduled_days`、`reserved_words`、`review_batches`、`word_marks`、`mark_operations`。

完整快照 v1 包含逐表精确列/主键/建表 SQL/行/哈希、全部内置词条和场景、三份原始迁移 SQL/哈希、schemaVersion、构建源树指纹及 baseCommit。baseCommit 是构建前 Git 基点，不冒称之后发布提交的 ID。代码版本不是学习数据；重新部署代码不会自动找回数据库。包不含环境变量、DeepSeek key、Sites 服务凭据或完整代码仓库；原始表中内部 CAS/租约字段属于恢复所需数据，保留但不是外部授权凭据。

只归档服务端已确认的数据；浏览器尚未同步的离线 outbox 不在云端快照中。导出上限 **16MiB 未压缩 JSON / 每表 200000 行**，超限、结构漂移、截断、资源错误均失败，不分页冒充完整。ZIP 上限 50MiB、总展开上限 24MiB，初始 legacy 基线至多 2MiB；失败时保留旧包，不能以空包替代。

独立 Node24 工具由 `npm run backup:tools` 生成，运行只依赖 Node 内建模块，无需本仓库或 node_modules：

```bash
# 首次完整包：必须使用升级前已核验的真实 v3 基线；该私人 JSON 不入 Git。
node verify-backup.mjs --new candidate.json --legacy-baseline trusted-v3.json
node pack-backup.mjs --snapshot candidate.json --legacy-baseline trusted-v3.json --out candidate.zip

# 每次更新：先取回固定旧 ZIP；缺失、损坏或工具 pin 不符，立即停止，不重新建立基线。
node verify-backup.mjs --new candidate.json --old previous.zip --legacy-baseline previous.zip
node pack-backup.mjs --snapshot candidate.json --legacy-baseline previous.zip --out candidate.zip
node verify-backup.mjs --new candidate.zip --old previous.zip --legacy-baseline previous.zip
node restore-backup.mjs --snapshot candidate.zip
```

`pack-backup` 只创建不存在的新临时路径（不覆盖旧文件），并原样携带初始 `legacy-baseline.json`。单个 ZIP 固定包含 `snapshot.json`、`legacy-baseline.json`、`verify-backup.mjs`、`restore-backup.mjs`、`pack-backup.mjs`、`README.txt`、`manifest.json`。ZIP 读取核验 CRC、每项长度/哈希与固定文件清单；不可接受路径、压缩炸弹或伪大空 JSON。自动化须**在包外固定三个工具的可信 SHA256**，执行前比对，不能只信包内自报 manifest。

验证器输出 JSON，退出码 0 表示 `approve` 或 `unchanged`，2 表示 `reject`。没有旧完整快照或可信 legacy 基线就拒绝；`unchanged` 忽略导出时间，按规范内容哈希判断，不上传。`approve` 还必须隔离恢复成功后，才可用 `expected_current_version` 条件替换同一个私人 Space 文件。禁止按日创建新文件；固定文件 404、下载不全或任一校验失败均保留旧档并报告。Space 自身可能保留版本，应用不承诺历史版本零占用。原生 Space 更新与每日调度由外部授权任务负责，不在网站内保存其凭据。

内容守卫逐 ID 和关系检查，不只比较汇总：保护已学词 ID/首次日期/阶段/暴露、不可变评分事件与批次、已冻结计划/预留和点击日志；相同数量替换成默认词、清空/回退字段、缺日志均拒绝。正常难度减 1 需新增操作日志解释；旧日志只有毫秒时间、同毫秒次序不可恢复时按可达计数区间验证并明确警告，不虚称知道原顺序。手动破坏性导入、未经认可的 schema/内置词库变化若无法证明连续性，失败关闭，交人工审查，而不是重建空基线。

恢复工具只在全新随机临时 SQLite 中执行包内已固定哈希的迁移，逐列插入所有原始行，`quick_check` 后逐行核对，最后删除临时目录；**没有生产连接或任意目标路径选项**。保留 review/mark 幂等账本，恢复测试覆盖旧请求重放不重复计数。生产恢复另需明确授权、暂停写入及协调旧客户端 outbox；不能用普通 `/import` 代替。恢复后的所有者命名空间固定 `site-owner`，Node adapter 默认 `local-owner` 不能直接读取，接入时须由可信服务器显式指定 `owner:'site-owner'`，不可随意改写原始快照 owner。

## 运行与验证

需要 Git、**Node 24.22.1**（`.nvmrc` / `.node-version`）和随 Node 安装的 npm。使用完整开发依赖；构建需要 Vinext、Wrangler 和 esbuild，不要用 `--omit=dev`。以下命令均来自仓库，不需要外部 Sites helper：

```bash
nvm install
nvm use
npm run install:ci
npm run db:migrate
npm run dev -- --port 4173
```

打开 `http://localhost:4173`。默认不配置密钥，规划使用明确标注的离线回退，不调用付费 AI。想做本地 AI 实验时，先阅读 `MIGRATION.md` 的环境变量与费用说明。本机新库只自动提供 224 个原创词，另外 3742 个词的显式装入命令见迁移说明；不能把未执行导入称作已拥有完整词库。

检查与本地构建：

```bash
npm run typecheck
npm test
npm run test:setup
npm run build
npm start -- --port 4173
```

`npm start` 是构建结果的**本机 Wrangler 预览**，不是云部署。先停止仍占用同一端口的开发进程。`db:migrate` 只允许固定的本地 `.wrangler/state`、占位数据库 ID 和 `drizzle` 迁移目录；通过 `d1_migrations` 账本跳过已完成迁移，拒绝全部额外参数。没有远程数据库选项。旧的手工 DDL 库若没有迁移账本可能报表已存在，脚本不会自行删除或伪造迁移；先保留旧库再另行迁移。

已有 `.env` / `.dev.vars` 不会随 Git 提交；`db:migrate`、普通构建和上述检查都不需要 DeepSeek key。源 ZIP 若没有 Git 元数据，需先初始化 Git 并提交源码，构建才能记录真实的 Git 基点。`npm run db:generate` 仅供将来有意修改 schema 时生成**新**迁移使用，不是每次启动或恢复数据的步骤。

生产由 Sites 绑定 **DB** 并按序应用迁移。已应用 0000 / 0001 永不可改，V5 新增 0002_loose_energizer.sql 两张难度表，schema 只追加迁移。密钥 `DEEPSEEK_API_KEY` 仅通过 Sites 生产运行时变量配置；没有实际密钥文件，不写进 `hosting.json` 或 `NEXT_PUBLIC_*`。provider 固定请求 `https://api.deepseek.com/chat/completions`，客户端不能自定义模型、host 或凭据。

### 可选 Node24 / SQLite 本机 API

`npm run start:node`，默认 `127.0.0.1:8788`、数据库 `/tmp/vocab-wheel.sqlite`（`VOCAB_DB_PATH` 可指定）。使用相同核心、HTTP API 与校验后的不可变迁移。只提供 API，不打包 React 页面；仅回环，没有公网鉴权，不可直接暴露公网。

## 私人访问边界

本版本只允许 **Sites owner-private** 部署。平台在请求到应用前保护浏览器访问及原生所有者服务访问；应用固定 `site-owner` 单人命名空间，不信请求体/查询参数/未经验证头部里的身份。

**不可直接把 Site 改成 public/shared，也不可裸放 Worker 到公网。** 多用户/公开 API 必须先增加每请求认证与逐记录授权。没有自制测试绕过或备用口令。写入拒绝跨站 Origin / Sec-Fetch-Site。

核心位于 `src/core`，应用服务 / Repository / AIPlanner 位于 `src/server`，不把 React、Cloudflare 或模型 SDK 混进记忆逻辑。Node/SQLite adapter 位于 `src/adapters`；可替换适配器嵌到其他平台。

## 持久化到底在哪里

线上是 **Cloudflare D1（SQLite 数据库）**，通过 Sites 的 `DB` 绑定访问，不是浏览器里放一份模拟数据库：

- `word_progress` 保存首次学习日、复习阶段、下一复习日、真实暴露次数。
- `review_events` / `review_batches` 保存评分与整组幂等记录。
- `word_marks` 保存累计难度计数、版本、更新时间；`mark_operations` 保存点击 ID 去重。
- `scheduled_days` / `reserved_words` / `plan_config` 保存冻结日期计划、库存预留和周期配置。
- `custom_lexicon` 与 `user_state` 保存导入词库和设置。

客户端 localStorage 只保存未同步操作和旧版本未提交选择，不是唯一进度来源。服务端确认后队列按 ID 清理；更换设备可读取相同服务端记录。开发用 Node adapter 才是本机 SQLite 文件（默认 `/tmp/vocab-wheel.sqlite`），不是生产存储位置。
