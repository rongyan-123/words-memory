# 音标来源、许可与可复现性

## 本次采用的方案

- **口音**：通用美式英语（General American，`en-US`），不是英式英语。
- **直接来源**：[open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict)，仅取其 `data/en_US.txt` 中与内置词库精确匹配的行。
- **固定版本**：[`43c3570eb3553bdd19fccd2bd0091534889af023`](https://github.com/open-dict-data/ipa-dict/commit/43c3570eb3553bdd19fccd2bd0091534889af023)。该提交可通过公开 commit 页面核实；没有依赖被拒绝的 GitHub REST 元数据请求。
- **固定文件**：[en_US.txt](https://raw.githubusercontent.com/open-dict-data/ipa-dict/43c3570eb3553bdd19fccd2bd0091534889af023/data/en_US.txt)。原文件 3,180,267 字节，SHA-256：`2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67`。
- **覆盖**：224 个内置词条中 **218 个**（约 97.3%）。未收录：`resolver`、`hostname`、`runtime`、`namespace`、`GPU`、`checksum`。没有猜测缩写读法、拼接复合词或自行生成缺失音标。
- **保存范围**：只提交 218 个匹配词条、覆盖元数据、生成脚本和许可说明；不在项目中保存整部上游词典。
- **采集日期**：2026-10-31。

## 转录规则与边界

`pronunciations-subset.json` 保留源词典中的 IPA 字符串原文（仅去除行尾空白）。`pronunciations.ts` 使用小写英文词形为键；原始词条 ID 和 `seed.ts` 均不改变。

本项目**不进行 ARPABET → IPA 转换**，也不自己添加、移动重音符号。源词典的多个发音变体全部保留，未根据词性自动择一；例如名词/动词异读可能同时出现。使用者不应把它视作经过语言学家逐词审校的官方考试发音库。

浏览器 `speechSynthesis` 属于设备提供的合成语音，与这里的 IPA 数据来源分开；不能称为原词典真人录音，也不保证每个设备使用同一口音。导入词库自带的 `Word.phonetic` 应优先显示；没有自带音标且不在此映射中的词明确显示“待补音标”。

界面中的单词、音标和喇叭负责合成朗读；独立 `+N` 按钮只展开/收起词典读法，不播放、不切换声音。合成输入是英文词形，不能保证 `record` 等词的每个名词/动词 IPA 变体都能被逐项准确读出。不存在这些变体对应的真人录音资源，不制造“点哪个 IPA 就精准播放哪个变体”的承诺；语音 API 报错或未确认启动会提示；系统静音和设备实际音量无法自动检测。

## 许可链与归属

英文释义和双语例句的原创 **CC0-1.0 不适用于第三方音标**。音标保持其单独许可：

1. **ipa-dict**：MIT，Copyright (c) 2016 dohliam。[固定版本 LICENSE](https://github.com/open-dict-data/ipa-dict/blob/43c3570eb3553bdd19fccd2bd0091534889af023/LICENSE)。其 [README Credits 与 License](https://github.com/open-dict-data/ipa-dict/blob/43c3570eb3553bdd19fccd2bd0091534889af023/README.md) 明确说明：English (US) 数据源自修改版 cmudict-ipa，重音标记借助 syllabify；第三方数据保留原许可。
2. **cmudict-ipa**：MIT，Copyright (c) 2016 Lingliang Zhang。[保留的原始 LICENSE](https://github.com/lingz/cmudict-ipa/blob/629483e9a7fa5b9ff11bb83e3fda6dcc25c5c511/LICENSE)。项目自述将 CMUdict 编码为 IPA。此版本用于固定许可文本与归属，并不宣称已经证明 ipa-dict 在历史上恰好使用了该提交。
3. **syllabify**：其 `syllabify.py` 文件头包含 MIT 条款，Copyright (c) 2012–2013 Kyle Gorman。[固定许可头](https://github.com/kylebgorman/syllabify/blob/d816db784436e9de87ec1ef9bd11b8e229853710/syllabify.py)。本项目仅保留许可归属，不运行或捆绑该 Python 转换器；同样不宣称此提交是 ipa-dict 当年的确切构建输入。
4. **Carnegie Mellon Pronouncing Dictionary (CMUdict)**：Copyright (C) 1993–2015 Carnegie Mellon University。保留其完整两项再分发条件、资助致谢和免责声明，采用 `LicenseRef-CMUdict` 标识而非把全部数据统称 MIT。[固定 LICENSE 文本](https://github.com/cmusphinx/cmudict/blob/74790861f652b15e4ac49015a90074ad62a27690/LICENSE)。

完整许可和归属随站点公开资源分发于 **`public/licenses/pronunciation-data.txt`**，浏览器路径 **`/licenses/pronunciation-data.txt`**。各许可文本的 URL 与 SHA-256 记录在 `pronunciation-license-manifest.json`。显示音标的界面应保留到该说明的可访问链接。

这是对公开来源与其明确许可声明的核对，不等同于完整上游版权审计或对词典准确性的担保。没有引入 ipa-dict 的 `en_UK` 数据（该数据另有 GPL-3.0 来源声明），也没有将其误当作 MIT 数据。

## 缺词核查

另外读取了 Wiktionary 的这 6 个公开词条：

- [resolver](https://en.wiktionary.org/wiki/resolver)：已读取的英语部分未提供 IPA；页面其他语言的 IPA 不能拿来充当英语发音。
- [hostname](https://en.wiktionary.org/wiki/hostname)：有英音音频，但未提供 IPA；没有自行听写。
- [runtime](https://en.wiktionary.org/wiki/runtime)：该拼写页没有 IPA；没有根据组成词拼接音标。
- [namespace](https://en.wiktionary.org/wiki/namespace)：有未明确限定口音的英语 IPA；本次映射只提供可明确标注的美音，所以没有为了覆盖率将未限定口音条目强标为 `en-US`。
- [GPU](https://en.wiktionary.org/wiki/GPU)：已读取的英语部分未提供 IPA；没有凭字母名自行拼接。
- [checksum](https://en.wiktionary.org/wiki/checksum)：有美音音频但未提供 IPA；没有自行听写。

**没有复制 Wiktionary 音标、释义或音频，因此本次子集没有混入其 CC BY-SA 内容。** 缺词列表保持可见，后续可在取得实际音标条目与清楚许可后独立补齐。

## 离线重建与显式刷新

从项目根目录运行（Node.js 24+）：

```sh
# 默认离线：从已提交的小子集重建 TypeScript，并校验覆盖与目标词库哈希
node src/data/generate-pronunciations.mjs

# 仅在希望重新核验公开源时显式联网；固定commit、固定源哈希、只留匹配子集
node src/data/generate-pronunciations.mjs --refresh
```

刷新逐块读取公开源，在内存中筛选目标词形并计算整文件 SHA-256，既不保存整库，也不向运行时加入第三方词典查询。源状态不是 HTTP 200、文件过大或校验值不一致时失败，不生成替代数据、不绕过访问拒绝。默认重建不联网、不调用付费 API，也不修改 `seed.ts`。
