# 依赖、词库与音标的许可范围

本文件是来源索引，不是给所有材料重新发放一份统一许可证，也不承诺所有上游数据已经完成版权清查。公开源码不等于可以忽略各自的再分发条件。原始许可全文随项目保留，不应删除作者、声明、来源版本或哈希。

## 原创词库

- `src/data/seed.ts`：224 个原创英汉释义和例句、16 个任务场景。原创词库文本为 CC0-1.0，见 `src/data/PROVENANCE.md`。
- CNCF 词头对应的简短中文教学释义由本项目自行编写，标为 CC0-1.0；只引用术语和来源链接，没有复制官网定义段落。CNCF 网站定义与其仓库代码的许可不是同一项，详见 `src/data/LEXICON_EXPANSION_SOURCES.md`。
- 不为整仓软件代码擅自增加统一开源许可；第三方代码保持原许可，原创应用代码的整体许可可由维护者另行确定。

## ECDICT 四级子集

- 来源固定为 `skywind3000/ECDICT` 的 `ab22ad36302cafc6349a050e2b60894855208055`。仓库声明 MIT，完整声明、版权文字和混合上游披露在 `public/licenses/ecdict.txt`。
- 本仓库只包含项目选定的子集，不是 770,611 行的上游整部词典。3849 个精确 `cet4` 源成员经可追溯拼写/变体映射成为 3847 个学习词形，与原创词合计运行词库 3966 个。
- MIT 仓库声明不能被解释为本项目已逐项核清混合上游材料的权利链。既有用途是个人试用；公开迁移保留此风险披露，**不宣称官方四级考纲、可任意商用或已完整清权**。进行更广泛分发或商业使用前，应另行核实上游权利及适用条件。
- `public/lexicons/final-import.json`、源成员映射、清理报告、导入 manifest 和逐词来源均保留。音标是来源字段，未统一为美式读音，也不猜缺失内容。

## 美式 IPA 子集

- 218 个原创词的 IPA 展示映射来自固定版 ipa-dict / cmudict-ipa / syllabify / CMUdict，不属于原创词库 CC0。
- MIT 与 CMUdict 许可全文在 `public/licenses/pronunciation-data.txt`；每个来源的版本、链接和许可哈希在 `src/data/PRONUNCIATION_SOURCES.md` 与 `src/data/pronunciation-license-manifest.json`。
- 浏览器 Web Speech 合成语音不是上述词典的真人录音，也不能保证逐个 IPA 变体的词性发音。

## 框架与第三方代码

- React、Vinext、Next 兼容 API、Vite、Wrangler、Drizzle 及其他依赖由 `package.json` / `package-lock.json` 固定。安装包的原始许可证随各依赖提供；依赖版本和许可证需要分别核对，不能将某个依赖的 MIT 许可套到整仓。
- Sites 构建插件原始 MIT 声明保留于 `build/sites-vite-plugin.LICENSE`。
- 随仓保留的 shadcn Tailwind 样式声明在 `vendor/shadcn-tailwind-4.13.0.LICENSE.md`。
- `node_modules`、构建产物及包管理器缓存不作为源码上传；锁文件中解析来源为 npm 公共注册表，正常安装会重新取回依赖及对应声明。

## 学习记录

`migration/disaster-backup.zip` 不是示例数据，而是所有者明确同意公开的历史学习快照。它没有被当作 CC0 词库重新授权，也不应冒称某位后来使用者的学习记录。不要把其他使用者的后续个人记录或密钥提交到仓库。
