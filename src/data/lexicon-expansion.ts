/**
 * Compact provenance / presentation overlays from the approved frozen expansion.
 * No full dictionary or 2.4 MB audit metadata is bundled here.
 * Stable seed IDs, original meanings, IPA and stored study state are not edited.
 */
export const ECDICT_SOURCE_URL = 'https://github.com/skywind3000/ECDICT/tree/ab22ad36302cafc6349a050e2b60894855208055';
export const ECDICT_LICENSE_URL = '/licenses/ecdict.txt';
export const CNCF_SOURCE_URL = 'https://glossary.cncf.io/';
export interface SeedWordOverlay {
  readonly term: string;
  readonly cet4: boolean;
  readonly addTags: readonly string[];
  readonly generalMeaning?: string;
  readonly technicalMeaning: string;
  readonly technicalContextReference?: string;
}
type OverlayRow = readonly [id: string, term: string, cet4: boolean, general: string | null, technical: string, reference: string | null];
const overlayRows: readonly OverlayRow[] = [
  [
    "w-access",
    "access",
    true,
    "n. 通路, 入口, 接近, 进入, 使用权, 发作\nvt. 访问, 存取, 接近, 使用\n[计] 访问, 存取",
    "访问；访问权限",
    null
  ],
  [
    "w-account",
    "account",
    true,
    "n. 报告, 解释, 估价, 理由, 利润, 算账, 帐目\nvi. 报帐, 解释, 导致, 报偿, 占, 杀死\nvt. 认为\n[计] 帐户, 帐号",
    "账户；解释",
    null
  ],
  [
    "w-address",
    "address",
    true,
    "n. 住址, 演说, 举止, 灵巧, 求爱\nvt. 发表(演说或讲话), 对付, 写地址\n[计] 地址, 寻址",
    "地址",
    "https://kubernetes.io/docs/concepts/services-networking/"
  ],
  [
    "w-allow",
    "allow",
    true,
    "vt. 允许, 同意给予, 承认\nvi. 容许, 猜想\n[计] 允许命令",
    "允许",
    null
  ],
  [
    "w-application",
    "application",
    true,
    "n. 应用, 申请, 志愿书, 应用程序\n[计] 应用, 应用程序",
    "应用程序；申请",
    null
  ],
  [
    "w-available",
    "available",
    true,
    "a. 可利用的, 可获得的, 有效的\n[医] 有效的, 可得的",
    "可用的；有空余的",
    null
  ],
  [
    "w-average",
    "average",
    true,
    "n. 平均, 平均数, 一般水平, 海损\na. 平均的, 中等的, 平常的\nvt. 算出...平均数, 平均做, 均分, 使平衡\nvi. 平均为, 呈中间色",
    "平均值；平均的",
    null
  ],
  [
    "w-balance",
    "balance",
    true,
    "n. 平衡, 差额\nvi. 平衡, 相等\nvt. 称, 权衡, 比较, 使平衡, 结算, 抵消",
    "余额；平衡",
    null
  ],
  [
    "w-branch",
    "branch",
    true,
    "n. 树枝, 支店, 支流, 分部\nvi. 分支, 出枝\nvt. 分割, 用枝状叶脉刺绣花纹装饰\n[计] 分支, 目录分支",
    "分支；支流",
    null
  ],
  [
    "w-budget",
    "budget",
    true,
    "n. 预算\nvi. 编预算\nvt. 编入预算, 安排\na. 廉价的",
    "预算",
    null
  ],
  [
    "w-burst",
    "burst",
    true,
    "n. 破裂, 突发, 爆发\nv. 爆裂, 突发, 充满\n[计] 二进制位组; 字符组; 脉冲串",
    "突发；短时间的集中增加",
    null
  ],
  [
    "w-capacity",
    "capacity",
    true,
    "n. 容量, 能力, 才能, 资格\n[计] 容量",
    "容量；容纳能力",
    null
  ],
  [
    "w-cause",
    "cause",
    true,
    "n. 原因, 目标\nvt. 引起, 使产生, 使遭受",
    "原因；导致",
    null
  ],
  [
    "w-certificate",
    "certificate",
    true,
    "n. 证书, 证明书\nvt. 发给证明书, 用证书批准, 用证书证明",
    "证书；证明文件",
    null
  ],
  [
    "w-charge",
    "charge",
    true,
    "n. 指控, 费用, 冲锋, 电荷, 炸药, 主管, 被托管人, 命令\nvt. 控诉, 加罪于, 使充满, 使充电, 使承担\nvi. 冲锋, 要价, 收费",
    "收费；费用",
    null
  ],
  [
    "w-column",
    "column",
    true,
    "n. 专栏, 圆柱, 纵队, 列, 柱形物\n[计] 列, 柱形图",
    "列；栏目",
    null
  ],
  [
    "w-command",
    "command",
    true,
    "n. 命令, 指挥, 控制, 部队, 司令部\nv. 命令, 指挥, 控制\n[计] 命令; 指令; DOS外部命令:启动新的命令处理器",
    "命令；指令",
    null
  ],
  [
    "w-commit",
    "commit",
    true,
    "vt. 委托(托付), 犯罪, 指派...作战, 使承担义务\n[法] 犯, 做, 把...交托给",
    "提交；提交记录",
    null
  ],
  [
    "w-compare",
    "compare",
    true,
    "vt. 比较, 比喻, 对照\nvi. 相比\nn. 比较\n[计] 比较",
    "比较；对照",
    null
  ],
  [
    "w-comparison",
    "comparison",
    true,
    "n. 比较, 对照, 比喻\n[经] 比较, 对比",
    "比较；对照",
    null
  ],
  [
    "w-compose",
    "compose",
    true,
    "vt. 组成, 写作, 作曲, 使平静\nvi. 创作, 排字\n[计] 编写",
    "组合；编排",
    null
  ],
  [
    "w-compress",
    "compress",
    true,
    "vt. 压缩, 压紧\nvi. 受压缩小\n[计] 压缩程序",
    "压缩",
    null
  ],
  [
    "w-compute",
    "compute",
    true,
    "v. 计算, 估算\nn. 计算, 估算",
    "计算；计算资源",
    null
  ],
  [
    "w-confirm",
    "confirm",
    true,
    "vt. 证实, 确定, 批准, 使巩固\n[计] 确认",
    "确认；证实",
    null
  ],
  [
    "w-connection",
    "connection",
    true,
    "n. 连接, 关系, 前后关系\n[计] 连接",
    "连接；联系",
    null
  ],
  [
    "w-consistent",
    "consistent",
    true,
    "a. 一致的, 坚持的, 并立的, 坚固的",
    "一致的；连贯的",
    null
  ],
  [
    "w-container",
    "container",
    true,
    "n. 容器, 集装箱\n[化] 集装箱; 贮存箱; 容器(任何一种)",
    "容器；隔离运行应用的环境",
    null
  ],
  [
    "w-core",
    "core",
    true,
    "n. 核心, 果心, 要点\nvt. 挖...的核\n[计] 内核, 核心网",
    "核心；主要部分",
    null
  ],
  [
    "w-delete",
    "delete",
    true,
    "vt. 删除\n[计] 删除",
    "删除",
    null
  ],
  [
    "w-demand",
    "demand",
    true,
    "n. 要求, 需求, 需要\nv. 要求, 查询",
    "需求；要求",
    null
  ],
  [
    "w-deny",
    "deny",
    true,
    "v. 否认, 拒绝",
    "拒绝；禁止",
    null
  ],
  [
    "w-device",
    "device",
    true,
    "n. 装置, 设计, 策略, 发明物, 设备\n[计] 设备; DOS内部命令:该命令要求DOS安装一个设备驱动程序",
    "设备；装置",
    null
  ],
  [
    "w-discount",
    "discount",
    true,
    "n. 折扣, 贴现率\nvt. 打折扣\nvi. 贴现",
    "折扣；打折",
    null
  ],
  [
    "w-disk",
    "disk",
    true,
    "n. 圆盘, 磁盘\n[计] 磁盘",
    "磁盘",
    null
  ],
  [
    "w-durable",
    "durable",
    true,
    "a. 持久的, 耐用的",
    "持久的；耐用的",
    null
  ],
  [
    "w-efficient",
    "efficient",
    true,
    "a. 有效率的, 能干的",
    "高效的；效率高的",
    null
  ],
  [
    "w-environment",
    "environment",
    true,
    "n. 环境, 外界, 围绕\n[计] 环境",
    "环境；运行环境",
    null
  ],
  [
    "w-error",
    "error",
    true,
    "n. 错误, 过失, 失误, 误差\n[计] 错误",
    "错误；误差",
    null
  ],
  [
    "w-evaluate",
    "evaluate",
    true,
    "vt. 评估, 评价, 赋值",
    "评估；评价",
    null
  ],
  [
    "w-exception",
    "exception",
    true,
    "n. 例外, 除外, 异议\n[计] 例外; 异常",
    "异常；例外",
    null
  ],
  [
    "w-execute",
    "execute",
    true,
    "vt. 执行, 实行, 完成, 处死, 制成\n[计] 执行",
    "执行；运行",
    null
  ],
  [
    "w-explain",
    "explain",
    true,
    "v. 解释, 说明",
    "解释；说明",
    null
  ],
  [
    "w-expose",
    "expose",
    true,
    "vt. 使暴露, 使曝光, 揭穿, 陈列\n[医] 暴露, 露置",
    "暴露；使服务可被外部访问",
    null
  ],
  [
    "w-failure",
    "failure",
    true,
    "n. 失败, 失败者, 不足, 缺乏, 破产\n[计] 故障; 失效",
    "失败；故障",
    null
  ],
  [
    "w-file",
    "file",
    true,
    "n. 档案, 公文箱, 文件夹, 文件, 卷宗, 锉刀\nvi. 列队行进, 用锉刀做\nvt. 归档, 申请, 锉, 琢磨\n[计] 文件",
    "文件；档案",
    null
  ],
  [
    "w-graceful",
    "graceful",
    true,
    "a. 优美的",
    "平稳的；妥善的",
    null
  ],
  [
    "w-identity",
    "identity",
    true,
    "n. 身份, 相同, 一致, 特性, 恒等式\n[计] (打)标记, 标识",
    "身份；标识",
    null
  ],
  [
    "w-image",
    "image",
    true,
    "n. 影像, 肖像, 想象, 图像, 形象, 翻版\nvt. 作...的像, 反映, 想象, 象征\nn. 图像\n[计] 图象",
    "镜像；图像",
    "https://kubernetes.io/docs/concepts/containers/images/"
  ],
  [
    "w-impact",
    "impact",
    true,
    "n. 冲击, 冲突, 影响, 效果\nvt. 挤入, 撞击, 压紧, 对...发生影响",
    "影响；冲击",
    null
  ],
  [
    "w-improve",
    "improve",
    true,
    "vt. 改良, 提高...的价值, 改善, 利用\nvi. 变得更好, 增加",
    "改善；提高",
    null
  ],
  [
    "w-incident",
    "incident",
    true,
    "n. 事件, 事变, 小事\na. 附带的, 易于发生的, 外来的, 入射的",
    "事件；服务故障事件",
    null
  ],
  [
    "w-increase",
    "increase",
    true,
    "n. 增加, 增进, 利益\nvt. 增加, 加大\nvi. 增加, 繁殖",
    "增加；提高",
    null
  ],
  [
    "w-index",
    "index",
    true,
    "n. 索引, 指针, 指数, 指标\nvt. 编入索引中, 指出\nvi. 做索引\n[计] 下标; 附标; 变址; 索引; 编索引",
    "索引；目录",
    null
  ],
  [
    "w-input",
    "input",
    true,
    "n. 输入, 输入电路\nvt. 输入\n[计] 输入",
    "输入；投入",
    null
  ],
  [
    "w-insert",
    "insert",
    true,
    "n. 插入物\nvt. 插入, 把(人造卫星)射入(轨道), 添写\nvi. 附着\n[计] 插入",
    "插入；添加",
    null
  ],
  [
    "w-install",
    "install",
    true,
    "vt. 安装, 安置, 使就职\n[计] 安装, 安装程序; DOS内部命令:安装常驻程序",
    "安装；设置",
    null
  ],
  [
    "w-instance",
    "instance",
    true,
    "n. 建议, 情况, 例子, 场合\nvt. 引以为例, 举例说明",
    "实例；一台运行中的虚拟服务器",
    "https://glossary.cncf.io/virtual-machine/"
  ],
  [
    "w-investigate",
    "investigate",
    true,
    "v. 调查, 审查",
    "调查；研究",
    null
  ],
  [
    "w-isolate",
    "isolate",
    true,
    "vt. 使隔离, 使孤立, 使绝缘\nn. 隔离种群",
    "隔离；单独确定",
    null
  ],
  [
    "w-issue",
    "issue",
    true,
    "n. 发行, 问题, 后果, 流出, 出口, 争端\nvi. 发行, 流出, 造成...结果, 传下\nvt. 使流出, 放出, 发行, 发布, 发给",
    "问题；议题",
    null
  ],
  [
    "w-layer",
    "layer",
    true,
    "n. 层, 产卵鸡, 放置者\nvt. 分层堆积, 压植\n[计] 层",
    "层；镜像层",
    null
  ],
  [
    "w-learning",
    "learning",
    true,
    "n. 学问, 学识, 学习\n[计] 学习",
    "学习；训练中的学习过程",
    null
  ],
  [
    "w-load",
    "load",
    true,
    "n. 负荷, 担子, 重担, 装载量, 负载, 工作量, 加载\nvt. 装载, 装填, 使担负\nvi. 装货, 上客, 装料\n[计] 加载, 装入程序",
    "负载；装载",
    null
  ],
  [
    "w-log",
    "log",
    true,
    "n. 记录, 圆木, 日志, 计程仪\nvt. 伐木, 切, 航行\nvi. 伐木\n[计] 日志",
    "日志；记录",
    null
  ],
  [
    "w-loss",
    "loss",
    true,
    "n. 损失, 遗失, 失败, 输, 错过, 伤亡\n[化] 损失; 损耗",
    "损失；损失值",
    null
  ],
  [
    "w-maintain",
    "maintain",
    true,
    "vt. 维持, 维修, 保持, 坚持, 供养, 主张\n[化] 维修",
    "维护；保持",
    null
  ],
  [
    "w-memory",
    "memory",
    true,
    "n. 记忆, 记忆力, 回忆, 纪念, 存储\nn. 内存\n[计] 存储器, 内存, 查看内存实用程序",
    "内存；记忆",
    null
  ],
  [
    "w-metric",
    "metric",
    true,
    "a. 公尺的, 公制的, 计量的\n[医] 测量的, 米制的, 公制的",
    "指标；衡量标准",
    null
  ],
  [
    "w-model",
    "model",
    true,
    "n. 模型, 模范, 模特儿\na. 模范的, 作模型用的\nvi. 做模型, 做模特儿\nvt. 使模仿, 塑造\n[计] 模型",
    "模型；模范",
    null
  ],
  [
    "w-monitor",
    "monitor",
    true,
    "n. 监督器, 级长, 监听员, 班长, 监视器, 告诫物\nv. 监视, 监听, 监督\n[计] 监视器, 监视程序; 监视",
    "监控；监视器",
    null
  ],
  [
    "w-mount",
    "mount",
    true,
    "n. 乘骑用马, 框, 衬纸, 山\nvi. 乘马, 爬上, 增长\nvt. 爬上, 使上马, 装上, 装裱, 安放, 制作...的标本, 设置, 上演\n[计] 安装",
    "挂载；安装",
    null
  ],
  [
    "w-network",
    "network",
    true,
    "n. 网络, 广播网, 网状物\n[计] 网络",
    "网络；网络系统",
    null
  ],
  [
    "w-output",
    "output",
    true,
    "n. 输出, 产品, 产量\n[计] 输出",
    "输出；产出",
    null
  ],
  [
    "w-path",
    "path",
    true,
    "n. 路径, 小路, 道路, 途径, 路线, 轨道\n[计] 路径; DOS内部命令:设定DOS读取程序的路径",
    "路径；路线",
    null
  ],
  [
    "w-peak",
    "peak",
    true,
    "n. 山峰, 巅, 山顶, 顶点, 尖峰, 帽舌\na. 最高的, 最大值的\nvi. 到达最高点, 消瘦, 变憔悴, 逐渐缩小\nvt. 使竖起, 使达到最高点",
    "峰值；高峰",
    null
  ],
  [
    "w-permission",
    "permission",
    true,
    "n. 许可, 允许\n[计] 许可, 认可",
    "许可；权限",
    null
  ],
  [
    "w-persist",
    "persist",
    true,
    "vi. 坚持, 固执, 持续, 坚称\n[经] 持续",
    "持久保存；持续存在",
    null
  ],
  [
    "w-physical",
    "physical",
    true,
    "a. 身体的, 物质的, 自然的, 物理学的, 好色的\nn. 体格检查",
    "物理的；实际存在的",
    null
  ],
  [
    "w-pipeline",
    "pipeline",
    true,
    "n. 管道, 传递途径\n[化] 管路; 管线",
    "流水线；串联的处理步骤",
    null
  ],
  [
    "w-port",
    "port",
    true,
    "n. 港口, 埠, 舱门, 避风港, 左舷, 炮眼, 姿势, 意义\nvt. 左转舵, 持(枪)\nvi. 左转舵\n[计] 端口, 移植",
    "端口；网络服务的编号入口",
    "https://kubernetes.io/docs/concepts/services-networking/service/"
  ],
  [
    "w-precision",
    "precision",
    true,
    "n. 精密, 精确, 精确度, 精度\na. 精密的, 精确的\n[计] 精度",
    "精度；数值表示的细致程度",
    null
  ],
  [
    "w-private",
    "private",
    true,
    "a. 私人的, 秘密的, 私立的, 隐蔽的\nn. 士兵, 隐士, 阴部\n[计] 私人的",
    "私有的；秘密的",
    null
  ],
  [
    "w-process",
    "process",
    true,
    "n. 程序, 进行, 过程\nvt. 加工, 使...接受处理, 对...处置, 对...起诉\na. 经加工的, 有特殊光效的\n[计] 进程",
    "进程；处理过程",
    "https://kubernetes.io/docs/tasks/configure-pod-container/share-process-namespace/"
  ],
  [
    "w-progress",
    "progress",
    true,
    "n. 进步, 发展, 前进\nvi. 进步, 进行",
    "进展；进度",
    null
  ],
  [
    "w-prompt",
    "prompt",
    true,
    "n. 激励, 提示, 提醒物, 提词, 付款期限\na. 迅速的, 敏捷的, 立刻的, 提词员的\nvt. 激励, 鼓动, 提示\nadv. 准时地\n[计] 提示符; DOS内部命令:设定DOS命令行的提示符",
    "提示词；提示",
    null
  ],
  [
    "w-public",
    "public",
    true,
    "n. 公众, 民众\na. 公众的, 公共的, 公立的, 公用的",
    "公开的；公共的",
    null
  ],
  [
    "w-queue",
    "queue",
    true,
    "n. 辫子, 一队人, 队列\nvt. 使排队, 将...梳成辫子\nvi. 排队\n[计] 队列",
    "队列；排队",
    null
  ],
  [
    "w-rate",
    "rate",
    true,
    "n. 比率, 率, 速度, 价格, 费用, 等级\nvt. 估价, 认为, 鉴定等级, 责骂\nvi. 被评价, 责骂",
    "速率；比率；费率",
    null
  ],
  [
    "w-record",
    "record",
    true,
    "n. 记录, 履历, 档案, 审判记录, 最高纪录, 唱片\nvt. 记录, 记载, 标明, 将...录音\nvi. 记录, 录音, 可被录音\na. 创纪录的\n[计] 录制, 记录",
    "记录；DNS 记录",
    null
  ],
  [
    "w-recover",
    "recover",
    true,
    "vt. 重新获得, 恢复, 复原, 拯救\nvi. 痊愈, 复原, 胜诉\n[计] 恢复",
    "恢复；重新正常运转",
    null
  ],
  [
    "w-reduce",
    "reduce",
    true,
    "vt. 减少, 分解, 降低, 使衰退, 把...分解, 把...归纳\nvi. 减少, 减肥, 缩小\n[计] 缩小",
    "减少；降低",
    null
  ],
  [
    "w-region",
    "region",
    true,
    "n. 区域, 地带, 地区, 领域, 范围, 区\n[计] 区, 区域",
    "地区；云服务部署区域",
    null
  ],
  [
    "w-release",
    "release",
    true,
    "n. 释放, 发泄, 豁免, 发行, 释放证书\nvt. 释放, 解除, 放松, 豁免, 免除, 发布, 放弃, 让与\nn. 发布\n[计] 版本, 发布",
    "发布；发布版本",
    null
  ],
  [
    "w-reliable",
    "reliable",
    true,
    "a. 可靠的, 可信赖的\n[法] 可靠的, 可信赖的, 确实的",
    "可靠的；可信赖的",
    null
  ],
  [
    "w-remote",
    "remote",
    true,
    "a. 遥远的, 偏僻的, 疏远的, 微少的\n[计] 远程, 远程访问实用程序",
    "远程的；远处的",
    null
  ],
  [
    "w-reproduce",
    "reproduce",
    true,
    "v. 繁殖, 再生, 复制, 生殖\n[计] 复制",
    "复现；复制",
    null
  ],
  [
    "w-request",
    "request",
    true,
    "n. 请求, 需要, 申请书\nvt. 请求, 要求, 邀请\n[计] 请求",
    "请求；要求",
    null
  ],
  [
    "w-requirement",
    "requirement",
    true,
    "n. 需求, 必要条件, 要求\n[化] 要求; 合同要求",
    "要求；必要条件",
    null
  ],
  [
    "w-reserve",
    "reserve",
    true,
    "n. 储备品, 贮量, 后备军, 自然保护区, 保留, 拘谨, 节制, 储备金\nvt. 保留, 保存, 预订, 延期, 推迟",
    "预留；保留",
    null
  ],
  [
    "w-resolve",
    "resolve",
    true,
    "vi. 决定, 分解, 决心\nvt. 使分解, 解析, 解决, 消除, 决心\nn. 决定之事, 决心, 坚决",
    "解析；解决",
    null
  ],
  [
    "w-resource",
    "resource",
    true,
    "n. 资源, 财力, 办法, 策略, 急智, 消遣\n[计] 资源",
    "资源",
    null
  ],
  [
    "w-response",
    "response",
    true,
    "n. 反应, 回答, 响应\n[计] 应答",
    "响应；回答",
    null
  ],
  [
    "w-restore",
    "restore",
    true,
    "vt. 回复, 恢复, 归还, 修补, 修复\nvt. 还原\nvi. 还原\n[计] 还原; DOS外部命令:从备份盘中取回文件",
    "恢复；还原",
    null
  ],
  [
    "w-route",
    "route",
    true,
    "n. 路径, 途径, 路线\nvt. 确定路线, 按规定路线发送\n[计] 传递, 路由设定程序",
    "路由；路径；为……选择路径",
    null
  ],
  [
    "w-row",
    "row",
    true,
    "n. 排, 行, 街道, 划船, 吵闹\nvt. 使成排, 划, 划船, 参加(赛船), 痛骂\nvi. 划船, 划动, 争吵\n[计] 行",
    "行；一条数据记录",
    null
  ],
  [
    "w-rule",
    "rule",
    true,
    "n. 规则, 统治, 控制, 支配, 规律, 标准, 章程, 破折号, 铅线\nvt. 规定, 统治, 管理, 控制, 支配, 裁决\nvi. 统治, 管辖, 裁定\n[计] 规则, 水线",
    "规则；规定",
    null
  ],
  [
    "w-sample",
    "sample",
    true,
    "n. 样品, 范例, 样本\nvt. 抽样, 尝试\n[计] 示例, 字样",
    "样本；采样",
    null
  ],
  [
    "w-secure",
    "secure",
    true,
    "a. 无虑的, 安心的, 安全的, 可靠的, 保险的\nvt. 固定, 获得, 保证, 使安全, 掩护, 招致\nvi. 停止操作, 船抛锚",
    "安全的；保护",
    null
  ],
  [
    "w-select",
    "select",
    true,
    "a. 挑选出来的, 极好的\nv. 选择, 挑选\nn. 被挑选者, 精萃\n[计] 选定",
    "选择",
    null
  ],
  [
    "w-session",
    "session",
    true,
    "n. 期间, 开庭期, 会议, 学期\n[计] 会话, 对话, 会晤, 通用任务程序",
    "会话；一段连接过程",
    null
  ],
  [
    "w-solution",
    "solution",
    true,
    "n. 解决, 解答, 溶液\n[化] 溶液",
    "解决办法；方案",
    null
  ],
  [
    "w-source",
    "source",
    true,
    "n. 来源, 水源, 根源, 原始资料, 源\n[计] 来源, 源程序",
    "来源；源代码",
    null
  ],
  [
    "w-space",
    "space",
    true,
    "n. 位置, 空间, 距离, 太空, 空白, 间隔, (期刊等的)篇幅\nvt. 隔开, 分隔\nvi. 留间隔\n[计] 空白, 空格校验",
    "空间；空白",
    null
  ],
  [
    "w-status",
    "status",
    true,
    "n. 状态, 情形, 地位, 要人身份\n[计] 状态",
    "状态；情况",
    null
  ],
  [
    "w-storage",
    "storage",
    true,
    "n. 存储器, 储藏, 保管, 库存, 仓库\n[计] 存放处; 存储",
    "存储；存储空间",
    null
  ],
  [
    "w-stream",
    "stream",
    true,
    "n. 水流, 小河, 流出, 趋势, 人潮\nvt. 流出, 流动, 展开\nvi. 流, 涌, 飘扬\n[计] 流",
    "流；流式传输",
    null
  ],
  [
    "w-supply",
    "supply",
    true,
    "n. 补给, 供给, 供应品\nvt. 补给, 供给, 提供, 补充\nvi. 替代",
    "供应；供给",
    null
  ],
  [
    "w-tag",
    "tag",
    true,
    "n. 标签, 附属物, 碎片, 结束语, 口头禅, 附加语, 浑名, 标记, 标记符\nvt. 附以签条, 尾随, 添饰, 起浑名, 连接\nvi. 紧紧跟随\n[计] 标记",
    "标签；版本标记",
    null
  ],
  [
    "w-temporary",
    "temporary",
    true,
    "a. 暂时的, 临时的\nn. 临时工, 临时雇员\n[计] 临时",
    "临时的",
    null
  ],
  [
    "w-terminal",
    "terminal",
    true,
    "n. 终端机, 终点, 末端, 极限, 终点站\na. 终点的, 定期的, 致死的, 结尾的, 末端的, 晚期的\n[计] 终端; 终端设备",
    "终端；命令行窗口",
    null
  ],
  [
    "w-trace",
    "trace",
    true,
    "n. 痕迹, 踪迹, 微量, 迹线, 缰绳\nvt. 追踪, 回溯, 描绘\nvi. 追溯, 沿路走",
    "追踪；调用轨迹",
    null
  ],
  [
    "w-traffic",
    "traffic",
    true,
    "n. 交通, 通行, 运输, 交通量, 贸易, 交易, 交往, 通信量\nvi. 交易, 做买卖\nvt. 用...作交换\n[计] 通信量, 传输量",
    "流量；通信数据",
    null
  ],
  [
    "w-transfer",
    "transfer",
    true,
    "n. 迁移, 移动, 传递, 转让, 转移, 过户, 汇兑, 换车\nvt. 使转移, 调转, 调任, 改变, 传递, 转让\nvi. 转移, 转学, 转职, 换车\n[计] 传送",
    "传输；转移",
    null
  ],
  [
    "w-unique",
    "unique",
    true,
    "a. 独一无二的, 独特的, 稀罕的",
    "唯一的；独特的",
    null
  ],
  [
    "w-usage",
    "usage",
    true,
    "n. 用法, 使用, 习惯, 惯用法, 习惯法\n[经] 使用情况, 使用用途, 惯例",
    "使用量；用法",
    null
  ],
  [
    "w-verify",
    "verify",
    true,
    "vt. 证明, 查证, 证实, 检验, 校验\n[计] 校验, 检验; DOS内部命令:设定写入磁盘时是否验证写入的正确性",
    "验证；核实",
    null
  ],
  [
    "w-virtual",
    "virtual",
    true,
    "a. 实际上起作用的, 虚的, 实质的, 有效的, 事实上生效的\n[计] 虚拟",
    "虚拟的",
    null
  ],
  [
    "w-volume",
    "volume",
    true,
    "n. 册, 卷, 体积, 容量, 大量, 许多, 份量, 音量\nvi. 成团卷起\nvt. 把...收集成卷\na. 大量的\n[计] 卷",
    "存储卷；体积；音量",
    "https://kubernetes.io/docs/concepts/storage/volumes/"
  ],
  [
    "w-zone",
    "zone",
    true,
    "n. 地带, 带, 地区\nvt. 环绕, 使分成地带\nvi. 分成区\n[计] 卡片顶部的三行区; 区; 区域",
    "区域；可用区",
    null
  ],
  [
    "w-runtime",
    "runtime",
    false,
    null,
    "运行时；执行程序或容器所需的运行环境",
    null
  ]
];
export const seedWordOverlays: Readonly<Record<string, SeedWordOverlay>> = Object.freeze(Object.fromEntries(
  overlayRows.map(([id, term, cet4, general, technicalMeaning, reference]) => [id, Object.freeze({
    term, cet4, addTags: Object.freeze(cet4 ? ['cet4'] : ['cloud-native', 'programming']),
    ...(general ? { generalMeaning: general } : {}), technicalMeaning,
    ...(reference ? { technicalContextReference: reference } : {}),
  })]),
));

/**
 * Exact IDs with ECDICT's literal [计] marker in the frozen source metadata.
 * A candidate is NOT a verified modern cloud/AI usage or priority assignment.
 * 608 total = 603 CET4 members + 5 extra cloud-native dictionary matches.
 */
export const computingCandidateWordIds: ReadonlySet<string> = new Set(
  `ec-abstract-c59ddd3f
ec-accessory-1a460acd
ec-accuracy-5879092f
ec-acid-ae5eebff
ec-act-f83f07be
ec-action-bd938c68
ec-activity-0651863b
ec-ad-70ba3370
ec-add-7e9e5ac3
ec-addition-77f930e4
ec-agent-d4f0bc5a
ec-aid-109d7943
ec-aim-a27f9823
ec-alarm-5e94ec13
ec-alphabet-4dd4f383
ec-alternative-27747689
ec-analysis-f44e85c4
ec-anchor-79bfb0e2
ec-appearance-6d1622d0
ec-architecture-4ca303a3
ec-area-4a91ee5f
ec-argument-b74f83c9
ec-arrange-3c1f2776
ec-arrangement-438b5e57
ec-art-d3cec991
ec-article-84393add
ec-assemble-63ebfab6
ec-assign-9300b4d2
ec-assignment-ce7a7c10
ec-associate-178b6e06
ec-association-0b514913
ec-atom-1bf52183
ec-attach-a9190076
ec-attention-e0787d27
ec-attribute-a92bfd02
ec-automation-6d65ed5c
ec-axis-d39c1187
ec-background-89b91df1
ec-backward-47823b56
ec-band-65f15ce8
ec-bang-1ae3d354
ec-bar-fcde2b2e
ec-base-cae66217
ec-baseball-a01edad9
ec-bat-ca5bcec1
ec-beam-ae4b867c
ec-bind-f08dd851
ec-blank-ff71cf74
ec-board-859169b3
ec-bold-e0007a5b
ec-boot-4509beb0
ec-border-4f1a55de
ec-bore-706cd6db
ec-bounce-4d6723e5
ec-bound-5e1cf428
ec-boundary-931534c0
ec-broadcast-e88199c4
ec-bucket-c5879b8d
ec-button-c3e2d78f
ec-cabinet-a6e42a44
ec-cable-7d6e18d0
ec-calculator-d2d4a592
ec-calendar-5152790e
ec-camera-89e8b951
ec-cancel-2374d917
ec-cap-45e84635
ec-capture-460ee6aa
ec-carrier-5803587e
ec-cassette-5eb37b96
ec-catalog-652f5501
ec-cell-39d02b42
ec-channel-69e36568
ec-chapter-667b9327
ec-character-4bcef3de
ec-characteristic-bd70eb35
ec-chart-cc57fc19
ec-choice-cf83f0f9
ec-choose-725fed9d
ec-circuit-4666a3f6
ec-clock-d8198efa
ec-cluster-164cf1ca
ec-coarse-152397e3
ec-code-5694d08a
ec-collapse-93bc5d02
ec-collision-9550e70a
ec-combination-5f3258ea
ec-comment-c44bb2fd
ec-common-92a5dc04
ec-communication-d4e16994
ec-compile-eba8dcd6
ec-component-6985ca1f
ec-concert-5359565a
ec-condition-596d40a4
ec-conflict-fa9e1d22
ec-confusion-32c87092
ec-conjunction-12abd6fb
ec-constant-96f6549c
ec-content-ed7002b4
ec-continuous-f7496f1f
ec-contrast-3426125b
ec-control-0fcd568a
ec-convention-37806e80
ec-conversion-0b236a74
ec-convert-c4757967
ec-corresponding-03b7a0d9
ec-count-6c35493a
ec-counter-efe899c7
ec-crash-cdb2e0d0
ec-crop-375676bd
ec-cross-b3986952
ec-cue-14da5d70
ec-current-97b05602
ec-custom-6cdfd271
ec-cycle-c501935a
ec-dam-2fcb6465
ec-data-3a6eb079
ec-deal-f96c94f2
ec-decision-86ae35d5
ec-deck-d8303259
ec-define-ecd38f26
ec-definition-4c4ed1af
ec-delay-6e16db10
ec-depth-ded32129
ec-destination-b5c755aa
ec-detail-9c0211c5
ec-detection-dad9a79b
ec-dialog-69401894
ec-diamond-81c9d612
ec-difference-69ea741e
ec-digest-0bf47489
ec-digital-cda3c373
ec-dim-c5d4b459
ec-dip-b6813f3a
ec-direction-93c4abe2
ec-directly-9251036c
ec-director-ef7d7489
ec-disable-e9d8992f
ec-dismiss-5880072b
ec-display-dfbb889c
ec-distance-63e6ce93
ec-distribution-93354845
ec-divide-895479bf
ec-division-990b23e8
ec-document-43cc23fa
ec-dot-e392dad8
ec-draft-7743ce34
ec-drag-4ac5248b
ec-drawer-d329f11d
ec-drawing-27f32826
ec-drop-d90ee9cc
ec-drum-2752a2b5
ec-dump-b6ca0868
ec-duration-caa79af4
ec-dynamic-73c76d56
ec-earn-cf07a76f
ec-echo-092c79e8
ec-editor-1553cc62
ec-effect-dcb57642
ec-electronic-73e4c514
ec-electronics-a848a87f
ec-element-44592926
ec-enable-e97166b5
ec-endure-93a80394
ec-enter-e08d706b
ec-entrance-3902eb87
ec-entry-923fe539
ec-equal-f9d6cd1e
ec-equivalent-cc73c906
ec-essential-a55751ce
ec-event-b8e1f80b
ec-exchange-ab27b729
ec-exclusive-433cd7fc
ec-executive-180b988a
ec-exit-e596899f
ec-expand-d78de925
ec-expansion-167f448f
ec-expert-c7d25387
ec-export-d46aee08
ec-expression-b8bc0e4f
ec-extend-bf0bb4ee
ec-extension-26f1de33
ec-extent-2b4a5bdd
ec-facility-87c59728
ec-factor-41a09310
ec-fault-f1c562ea
ec-fax-4af4e217
ec-feature-2ad56231
ec-feed-c8bc2586
ec-feedback-59bda3f8
ec-fetch-e7d3799e
ec-filter-dfc3376b
ec-finger-400b181c
ec-flag-807d0fbc
ec-flame-bd9dc5f7
ec-float-76a7e234
ec-focus-c51faa14
ec-fold-255541b1
ec-force-32500d75
ec-forecast-59f0db47
ec-fork-8d0c7ac9
ec-formula-7374df08
ec-fragment-7587669c
ec-frame-9dff50df
ec-freely-52ebe25e
ec-freeze-12dd9774
ec-frequency-2e9089fe
ec-function-78f9ac01
ec-gain-66dd231b
ec-gallery-ce387d5e
ec-gap-54d5dbf0
ec-garbage-795b6904
ec-gauge-a90fd9a9
ec-general-0feae16d
ec-generator-9123dcbb
ec-global-8001c274
ec-grammar-e05eb8a4
ec-grant-3492ad65
ec-graph-eef93e1d
ec-greek-92ae5b42
ec-growth-19c64195
ec-guide-83ca68be
ec-halt-3fd07d7b
ec-hammer-3ef81cb1
ec-handle-c2a116aa
ec-hardware-26787dd2
ec-hazard-652607e1
ec-heading-5e60ff5a
ec-heap-103a360f
ec-hide-1f5bb979
ec-highlight-dc2c5be1
ec-history-259aa8ef
ec-hit-63d04dee
ec-hook-0648298b
ec-horizontal-69b273a2
ec-host-4740ae63
ec-idle-4fb62348
ec-ignore-5f0af516
ec-imply-c3b290f1
ec-import-d942f648
ec-include-c0cbff04
ec-inquiry-84d74664
ec-instruction-5a92f6f0
ec-intensity-d0854ad1
ec-interaction-167d4b09
ec-interference-e3b1f58e
ec-intermediate-94e6f02a
ec-international-1e3bb894
ec-internet-3b0fe0d3
ec-interpretation-6e0534af
ec-interpreter-9666d9e8
ec-interrupt-a2090fd6
ec-interval-3fe1406a
ec-inverse-7705accd
ec-item-4a33eacd
ec-justify-2b578cbf
ec-keyboard-91f060a9
ec-kill-2bda9b4d
ec-label-1aca80e8
ec-lace-97eb1d61
ec-lag-2d0042b2
ec-lamp-c98e85f2
ec-lap-066addf6
ec-laser-94d8fe2c
ec-layout-1dc5ae5b
ec-leader-4d5b6609
ec-legend-ba29297b
ec-length-0f82aca6
ec-less-4fdd3b62
ec-level-0081779c
ec-librarian-2c445e1c
ec-line-38a9c1e7
ec-link-b1b1bdb4
ec-lip-8ac1ef53
ec-list-a330395c
ec-local-25bf8e1a
ec-location-e6eaea18
ec-logic-08e4e1c3
ec-loop-254637f7
ec-magazine-208be34b
ec-main-0d6e4079
ec-maintenance-8589c63b
ec-major-6558a6a3
ec-majority-226f9e95
ec-manual-36bde66f
ec-margin-34e39f66
ec-mark-6201eb4d
ec-mask-48bf9b4f
ec-maximum-8a64ff09
ec-measurement-6c5a6990
ec-media-721c9525
ec-medium-c082456a
ec-message-ab530a13
ec-microcomputer-9c755d06
ec-minimum-692e4e5d
ec-minor-cabd786a
ec-minus-129fa771
ec-mode-e642b129
ec-modify-9106d621
ec-mouse-47c5c28c
ec-multiply-0d31bc61
ec-needle-09881f6e
ec-negative-09f04951
ec-neighbourhood-d221bc04
ec-nest-75ef2e32
ec-net-a08a0fcb
ec-normal-317b32c1
ec-notify-6cd6f414
ec-nucleus-b933ef6f
ec-nut-7dfd8928
ec-object-2958d416
ec-observability-58ee0007
ec-odd-990cb8eb
ec-operation-9bf5a24e
ec-operator-06e55b63
ec-option-a11a75e0
ec-origin-181fdd46
ec-originate-19bf2c59
ec-orphan-88f6811a
ec-outline-31867882
ec-overhead-945c8f9d
ec-pack-4862f447
ec-package-bc4a7118
ec-packet-7426afc4
ec-pad-f563fcd3
ec-pane-24a3737d
ec-paragraph-c097a031
ec-parallel-83a00300
ec-paste-a2c183d5
ec-patch-a4895eb4
ec-pattern-1fd38d5c
ec-pause-6210c0bf
ec-percentage-8975c9b4
ec-permanent-0dd1b6d5
ec-permanently-f5d48a05
ec-perspective-74425421
ec-phase-02195b8e
ec-phrase-c00062f7
ec-pie-558211ed
ec-pilot-07ae38b9
ec-pine-d2922372
ec-pipe-40082947
ec-pitch-4502846f
ec-plain-a116c9ed
ec-platform-d294fcce
ec-plot-0f3850ab
ec-plus-383ef369
ec-poke-d138d529
ec-poll-707165e9
ec-pop-de70fa60
ec-portable-01e78282
ec-portrait-51c5a829
ec-position-5a452459
ec-power-07d715ed
ec-preference-bc5ece60
ec-previously-b42135b9
ec-primary-986a1b71
ec-primitive-db1946d3
ec-print-ce953a0e
ec-priority-3092a5f0
ec-procedure-0487c249
ec-program-1310ca2c
ec-proof-c1cda263
ec-property-fc918413
ec-protection-433c3507
ec-pulse-41b589ea
ec-quality-acef2c15
ec-quantity-1a7b308d
ec-quit-8577da2e
ec-race-129ce50d
ec-rack-8e9d1a8d
ec-radar-ff2e963f
ec-raid-263dae9a
ec-range-2269c0be
ec-rank-5a8460f6
ec-raw-d7439bee
ec-reader-3d094196
ec-realm-7d4e02d3
ec-recall-2ed6b4c1
ec-recorder-93384247
ec-recovery-8c585378
ec-reel-74a61185
ec-reference-52367a66
ec-reflection-f30409c5
ec-refresh-d6cc0a08
ec-refrigerator-0cf35ab8
ec-register-87780fa5
ec-regular-667937c3
ec-regulation-383b6630
ec-relation-fc8fbb48
ec-relatively-e2b3211f
ec-reliability-819bb986
ec-remark-1ffcd59e
ec-remove-7e5608ab
ec-repeat-25e2b6b1
ec-replace-7ab37787
ec-reply-5782b186
ec-resolution-f7fbd585
ec-restriction-ea257421
ec-result-f6a214f7
ec-resume-a83a3132
ec-retrieve-50f2a151
ec-reverse-b2d7f24e
ec-ribbon-affc35bd
ec-robot-18d63be1
ec-rotate-299bcf54
ec-rotation-224610f1
ec-routine-fde55b36
ec-ruler-59728140
ec-saint-8b49bda2
ec-save-157dca92
ec-scalability-54339434
ec-scale-f469802a
ec-scan-59ad1b2f
ec-scatter-e1f92433
ec-scientific-8592edc0
ec-scope-5f161c91
ec-score-a575b798
ec-scratch-5a9cb6b5
ec-screen-4cd6c291
ec-search-24193290
ec-section-3fb45623
ec-security-5d2d3ceb
ec-seek-cbd345d6
ec-segment-03e71c6d
ec-sense-5146f25d
ec-sentence-821119d7
ec-separately-dcb1661c
ec-sequence-bf37c7c2
ec-series-9cda38ea
ec-setting-ec72b956
ec-shade-e02d7fca
ec-shadow-0bb09d80
ec-shape-f58940a3
ec-share-c3bc45ac
ec-sheet-78af7bdb
ec-shell-ce635c4e
ec-shift-ecd3fad7
ec-sign-0b6f395c
ec-signal-d041924c
ec-signature-1a2fc26d
ec-significance-8698fb89
ec-simplicity-2ae05149
ec-slave-183936b0
ec-slice-03fdb065
ec-slip-1c1480e6
ec-snap-1c27324f
ec-soap-736bc2d4
ec-software-35390f54
ec-solid-4b3d4a0d
ec-solve-c14cdb19
ec-sort-64696494
ec-speaker-291ea5ef
ec-specify-a0aa99c8
ec-speed-bbccb9c0
ec-spelling-a6105b32
ec-split-ad1a6405
ec-spread-909802b2
ec-stack-6ee08e6e
ec-standard-fe6d3468
ec-state-4ba69735
ec-statement-b111c6e1
ec-statistics-49d48431
ec-step-3e64cc41
ec-stretch-1219929b
ec-string-473287f8
ec-stroke-1ba75736
ec-style-cb86eb2d
ec-substitute-75519932
ec-subtract-1cc624bb
ec-sum-09f5ffef
ec-summary-761b7ad8
ec-support-a1860308
ec-suspend-f516e6c2
ec-switch-78b49fb2
ec-symbol-b76a7ca1
ec-system-bbc5e661
ec-tap-729cd87c
ec-tape-8ba4ec7d
ec-task-0ebb429f
ec-telegram-3f404629
ec-tenant-e9da86d3
ec-term-599f7703
ec-theoretical-3b49d04a
ec-thick-7b1291e7
ec-thread-39200d1e
ec-throughout-d41d9e05
ec-tin-ab547757
ec-tip-97380187
ec-title-aaf23206
ec-tolerance-41e1e73d
ec-tone-00cf4ce3
ec-top-28720365
ec-track-2bb8bf72
ec-tractor-90276013
ec-transform-aa214ea3
ec-translate-7fd690e2
ec-translation-839cd116
ec-transmission-1d2cafdb
ec-transmit-d4db189c
ec-transparent-10e9f560
ec-transport-6694ea80
ec-trap-11ba6585
ec-trend-2ab022d8
ec-trim-657c97bf
ec-trunk-3e341d2d
ec-trust-f796e2f2
ec-tube-05cc6c65
ec-type-1303c06b
ec-underline-944969ef
ec-undo-f015346a
ec-unit-385cfdbc
ec-unload-3d0cf80e
ec-user-04f8996d
ec-utility-57ffcc28
ec-value-cd42404d
ec-van-970b1897
ec-variable-3b325109
ec-verb-6806f86a
ec-version-5ca4f385
ec-view-2bcb43cb
ec-virtual-machine-47831c0d
ec-virtualization-0b7635b2
ec-vocabulary-0c7e0de2
ec-weekday-82d048d2
ec-wise-c88af1b7
ec-workshop-ee510d1a
ec-worm-b9af17af
ec-wrap-f0a28992
w-access
w-account
w-address
w-allow
w-application
w-branch
w-burst
w-capacity
w-column
w-command
w-compare
w-compose
w-compress
w-confirm
w-connection
w-core
w-delete
w-device
w-disk
w-environment
w-error
w-exception
w-execute
w-failure
w-file
w-identity
w-image
w-index
w-input
w-insert
w-install
w-layer
w-learning
w-load
w-log
w-memory
w-model
w-monitor
w-mount
w-network
w-output
w-path
w-permission
w-port
w-precision
w-private
w-process
w-prompt
w-queue
w-record
w-recover
w-reduce
w-region
w-release
w-remote
w-reproduce
w-request
w-resource
w-response
w-restore
w-route
w-row
w-rule
w-sample
w-select
w-session
w-source
w-space
w-status
w-storage
w-stream
w-tag
w-temporary
w-terminal
w-traffic
w-transfer
w-verify
w-virtual
w-volume
w-zone`.split('\n'),
);

export const expansionInfo = Object.freeze({
  name: '四级主干与云原生扩展',
  sourceUrl: ECDICT_SOURCE_URL,
  licenseUrl: ECDICT_LICENSE_URL,
  license: 'ECDICT 仓库 MIT 声明；混合上游权利未完整核验',
  version: 'ab22ad36302cafc6349a050e2b60894855208055',
  sourceCsvSha256: 'd1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc',
  frozenImportSha256: '77391cc759b88f4a54917dd020af388f9596746d1f7510a07a39773ae47a1f69',
  frozenMetadataSha256: 'aa8c0dea5e2d5ab3cdb2f1d5d29faefdf666b12423d635b542ef3c5e461b10d0',
  totalWords: 3966,
  newWords: 3742,
  originalWords: 224,
  cet4Words: 3847,
  rawCet4Members: 3849,
  seedCet4Overlap: 129,
  seedOverlays: 130,
  computingCandidates: 608,
  cet4ComputingCandidates: 603,
  cloudNativeHeadwords: 25,
  newCloudNativeHeadwords: 24,
  cncfSourceUrl: CNCF_SOURCE_URL,
  cncfRepositoryCommit: 'c6493fa4824c440cca36a970f9ca68eeabc544bb',
  cncfIndexSha256: '7f9140cf89da77d25f6727c27c7c7a8060d5f89b75297133945da2c4dd7520bb',
  sourceNote: '四级仅指 ECDICT 的第三方 cet4 标签，非官方完整大纲；[计]仅为技术义候选。CNCF只引用术语和链接，中文简释原创。',
  phoneticNote: 'ECDICT 音标按来源保留，含传统符号且未统一口音，不应全部标为美音或标准化 IPA。',
});
