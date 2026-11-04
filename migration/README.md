# 已明确授权公开的历史学习快照

此目录中的 `disaster-backup.zip` 是真实的个人学习记录，不是演示 fixture。所有者在得知目标仓库公开后明确同意随源码上传。后续转为私有不能收回已经被克隆的副本。

- 服务端导出时间：**2026-11-04T02:39:25.768Z**。
- 未压缩原始完整 JSON：1,768,804 字节。
- 格式：`vocab-wheel-disaster-backup` v1，schemaVersion 3，固定 owner `site-owner`。
- 内容 SHA256：`799d40c7dd9b8b7c81e3c3db98fca700b45551d51f76b8b11a05f6da0b37fb63`。
- ZIP：359,083 字节；SHA256 `473c2410b5e529f8d238d783e8da45ac47751743b73756a39b23ee09a2f56a76`。
- 和先前有效备份逐 ID/字段/关系对比：`unchanged`，无 warning。仅导出时间变化不算学习数据变化。本次因明确的源码移交请求附带新导出包，不是改变每日备份的无变化跳过规则。
- 完整隔离恢复：11 表，`quickCheck: ok`，逐行核对通过，临时数据库已清理。

## 包内七个文件

`snapshot.json`、`legacy-baseline.json`、`verify-backup.mjs`、`restore-backup.mjs`、`pack-backup.mjs`、`README.txt`、`manifest.json`。

可信工具 SHA256（不能只相信 ZIP 自报 manifest）：

- verify：`f553a9365f2964233c66a722f56590a2704b83bbf61058dc4413434e1c8b44fa`
- restore：`a859b434940c11b59e65f91617b97855bdf71c332a1f2d360a572c761bc7e6a4`
- pack：`46286f7419e923c1c8ecad096794cf4be75e66a3ef349a3b5b675b8a027f06d2`
- 原始 legacy 基线：`bd00db9376996ef6dd3ca04e7cf0247b365445685d5f6895814c1437e0934a7c`

## 语义计数

- 3966 词 / 18 场景，包括 3742 个自定义新增词和 2 个新增场景。
- 已学 33 条、难度记录 36 条、累计难度 48。
- 评分事件 42、评分批次 25、难词操作日志 58。
- 冻结日 6、预留词 269。
- 原始逐表计数与验证报告见 `verification.json`。

未同步到服务端的浏览器操作不在快照里；没有 API key、身份/服务凭据、完整云账号或后台调度配置。这不是实时数据库，启动项目不会自动加载它。

完整验证和恢复限制见根目录 `MIGRATION.md`。现有 restore 工具只演练临时恢复，**不会持久恢复当前本机或线上数据库**。不要把 `/api/v1/import` 的合并导入冒充完整 11 表恢复。
