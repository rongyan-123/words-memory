import type { Scene, Word } from '../core/index.ts';

/**
 * Original educational text, not a copy of a commercial dictionary or an
 * official CET-4 word list. All definitions and examples in this file were
 * authored for this project and dedicated under CC0-1.0.
 */
const SOURCE = 'Wheel 原创释义与例句 · CC0-1.0';
type SeedScene = { id: string; title: string; description: string; task: string; entries: string };
const sceneData: SeedScene[] = [
  {
    id: 'choose-instance', title: '开一台云服务器',
    description: '从需求、区域到资源分配，读懂创建实例的完整流程。',
    task: '为个人网站选择合适区域，比较共享与独占资源，并创建一台虚拟服务器。',
    entries: `region|地区；云服务部署区域|Choose a region near your users.|选择靠近用户的部署区域。
zone|区域；可用区|This zone has spare capacity.|这个可用区还有空余容量。
instance|实例；一台运行中的虚拟服务器|Create an instance for the website.|为网站创建一个实例。
resource|资源|The application needs more resources.|这个应用需要更多资源。
available|可用的；有空余的|A smaller server is available now.|现在有一台较小的服务器可用。
requirement|要求；必要条件|Check the memory requirement first.|先检查内存要求。
select|选择|Select a suitable operating system.|选择合适的操作系统。
capacity|容量；容纳能力|The machine has enough capacity.|这台机器有足够的容量。
allocate|分配；划拨|Allocate two cores to the instance.|为这个实例分配两个核心。
virtual|虚拟的|A virtual machine shares physical hardware.|虚拟机共享物理硬件。
physical|物理的；实际存在的|The physical server runs several machines.|这台物理服务器运行着几台虚拟机。
shared|共享的|Shared resources may be less predictable.|共享资源的表现可能不太稳定。
dedicated|专用的；独占的|A dedicated server is more expensive.|独占服务器更贵。
reserve|预留；保留|Reserve enough capacity for tomorrow.|为明天预留足够的容量。`,
  },
  {
    id: 'remote-access', title: '第一次 SSH 连接',
    description: '连接远程主机，理解密钥、身份与命令执行。',
    task: '使用私钥连接远程主机，检查权限，在终端中执行一条安全的查询命令。',
    entries: `access|访问；访问权限|Only the owner has access to this server.|只有所有者有权访问这台服务器。
remote|远程的；远处的|Open a remote session from your laptop.|从笔记本电脑开启一个远程会话。
session|会话；一段连接过程|Close the session when you finish.|完成后关闭会话。
terminal|终端；命令行窗口|Type the command in the terminal.|在终端里输入这条命令。
command|命令；指令|This command lists the running processes.|这条命令列出正在运行的进程。
execute|执行；运行|Do not execute an unknown script.|不要执行来路不明的脚本。
permission|许可；权限|The file does not have write permission.|这个文件没有写入权限。
identity|身份；标识|The key helps prove your identity.|密钥帮助证明你的身份。
authenticate|验证身份|The server must authenticate the user.|服务器必须验证用户身份。
credential|凭据；用于证明身份的信息|Never paste a credential into a public chat.|不要把凭据粘贴到公开聊天中。
private|私有的；秘密的|Keep your private key on your own device.|把私钥保存在自己的设备上。
public|公开的；公共的|Copy only the public key to the server.|只把公钥复制到服务器上。
secure|安全的；保护|Use a secure connection for administration.|使用安全连接管理服务器。
connection|连接；联系|The connection closed after ten minutes.|连接在十分钟后关闭了。`,
  },
  {
    id: 'network-firewall', title: '让端口安全开放',
    description: '理解入站、出站、协议与访问规则，而不是盲目开放所有端口。',
    task: '仅开放网站需要的端口，限制管理入口，并检查入站与出站流量。',
    entries: `network|网络；网络系统|The two servers are on the same network.|这两台服务器在同一网络上。
address|地址|Enter the server address in your browser.|在浏览器中输入服务器地址。
port|端口；网络服务的编号入口|The service listens on port 8080.|这个服务监听 8080 端口。
protocol|协议；通信规则|HTTPS is a secure communication protocol.|HTTPS 是一种安全通信协议。
rule|规则；规定|Add a rule for the web service.|为网站服务添加一条规则。
allow|允许|Allow traffic only from trusted addresses.|只允许可信地址的流量。
deny|拒绝；禁止|Deny requests from unknown sources.|拒绝来自未知来源的请求。
inbound|入站的；进入的|Review the inbound rules before testing.|测试前检查入站规则。
outbound|出站的；向外的|The firewall blocks some outbound traffic.|防火墙阻止了部分出站流量。
firewall|防火墙|The firewall protects the management port.|防火墙保护管理端口。
traffic|流量；通信数据|Traffic increased after the announcement.|公告发布后流量增加了。
route|路由；路径；为……选择路径|This route sends traffic through the gateway.|这条路由让流量经过网关。
gateway|网关；网络之间的入口|The gateway connects the private network.|网关连接这个私有网络。
expose|暴露；使服务可被外部访问|Do not expose the database to the internet.|不要把数据库暴露到互联网。`,
  },
  {
    id: 'deploy-app', title: '把项目部署上线',
    description: '从代码仓库到构建、发布和重启，串起一条真实发布链路。',
    task: '拉取指定分支，安装依赖，检查环境配置，然后构建并发布应用。',
    entries: `application|应用程序；申请|The application starts in a few seconds.|这个应用几秒钟就能启动。
source|来源；源代码|Read the source before changing the behavior.|修改行为前先阅读源代码。
repository|代码仓库；存储库|The repository includes a setup guide.|这个代码仓库包含安装指南。
branch|分支；支流|Create a branch for the new feature.|为新功能创建一个分支。
commit|提交；提交记录|This commit fixes the startup error.|这次提交修复了启动错误。
dependency|依赖；所依赖的软件包|Install each dependency from a trusted source.|从可信来源安装每个依赖。
install|安装；设置|Install the required packages first.|先安装所需的软件包。
environment|环境；运行环境|Use a separate environment for testing.|使用独立的环境进行测试。
configuration|配置；配置内容|Keep secrets out of the public configuration.|不要把秘密放进公开配置中。
build|构建；编译打包|The build produces a small web bundle.|这次构建生成一个较小的网站包。
release|发布；发布版本|The new release improves loading speed.|新版本提高了加载速度。
deploy|部署；投入使用|Deploy the application after the tests pass.|测试通过后再部署应用。
restart|重新启动|Restart the service to apply the change.|重启服务以应用更改。
rollback|回滚；退回上一个版本|Prepare a rollback before the release.|发布前准备好回滚方案。`,
  },
  {
    id: 'domain-tls', title: '绑定域名与 HTTPS',
    description: '从域名解析到证书续期，定位网站能否安全打开。',
    task: '把域名指向服务器，验证解析记录，并为 HTTPS 配置有效证书。',
    entries: `domain|域名；领域|Point the domain to the new server.|把域名指向新服务器。
record|记录；DNS 记录|The DNS record contains an address.|这条 DNS 记录包含一个地址。
resolve|解析；解决|The domain should resolve to this address.|这个域名应该解析到这个地址。
resolver|解析器；DNS 查询服务|Try another resolver to compare the result.|尝试另一个解析器来比较结果。
request|请求；要求|The browser sends a request to the server.|浏览器向服务器发送一个请求。
response|响应；回答|The response contains the web page.|响应中包含网页内容。
certificate|证书；证明文件|The certificate confirms the site's identity.|证书确认网站的身份。
encrypt|加密|HTTPS encrypts data during transmission.|HTTPS 在传输过程中加密数据。
verify|验证；核实|Verify the certificate before continuing.|继续前验证证书。
redirect|重定向；转向|Redirect old links to the new page.|把旧链接重定向到新页面。
renewal|续期；更新|Enable automatic certificate renewal.|启用证书自动续期。
expire|到期；失效|The certificate will expire next month.|证书将在下个月到期。
trusted|可信的；受信任的|Use a certificate from a trusted provider.|使用可信提供方签发的证书。
hostname|主机名|The hostname must match the certificate.|主机名必须与证书匹配。`,
  },
  {
    id: 'storage-backup', title: '管理磁盘与备份',
    description: '区分临时文件、持久卷和快照，保护真正重要的数据。',
    task: '检查剩余磁盘空间，把数据写入持久卷，并完成一次可验证的备份恢复。',
    entries: `directory|目录；文件夹|Create a directory for the application data.|为应用数据创建一个目录。
file|文件；档案|This file contains the server settings.|这个文件包含服务器设置。
path|路径；路线|Use an absolute path in the script.|在脚本中使用绝对路径。
volume|存储卷；体积；音量|Attach a volume for persistent data.|挂载一个存储卷保存持久数据。
mount|挂载；安装|Mount the disk before reading the files.|读取文件前先挂载磁盘。
storage|存储；存储空间|The dataset needs more storage.|这个数据集需要更多存储空间。
disk|磁盘|The disk is almost full.|磁盘快满了。
space|空间；空白|Leave enough free space for logs.|为日志留出足够的可用空间。
backup|备份；备用副本|Make a backup before changing the database.|修改数据库前先做备份。
restore|恢复；还原|Restore the backup on a test machine.|在测试机器上恢复备份。
snapshot|快照；某个时点的状态副本|Take a snapshot before the upgrade.|升级前创建一个快照。
partition|分区；划分|The operating system uses the first partition.|操作系统使用第一个分区。
durable|持久的；耐用的|Store important records in durable storage.|把重要记录保存在持久存储中。
temporary|临时的|Temporary files may disappear after a restart.|临时文件可能在重启后消失。`,
  },
  {
    id: 'performance-monitor', title: '看懂性能监控',
    description: '用延迟、吞吐与资源指标发现瓶颈，不只盯着一个百分比。',
    task: '观察高峰期间的 CPU、内存、延迟和吞吐，找出最需要优化的瓶颈。',
    entries: `monitor|监控；监视器|Monitor the service during the release.|发布期间监控这个服务。
metric|指标；衡量标准|Choose a metric that reflects user experience.|选择能反映用户体验的指标。
usage|使用量；用法|Memory usage grows with the batch size.|内存使用量随批次大小增加。
memory|内存；记忆|The process needs more memory.|这个进程需要更多内存。
processor|处理器|The processor handles the incoming tasks.|处理器负责处理传入的任务。
load|负载；装载|The server is under heavy load.|服务器正承受较高负载。
latency|延迟；响应等待时间|Lower latency makes the app feel faster.|更低的延迟让应用感觉更快。
throughput|吞吐量；单位时间处理量|Measure throughput under realistic conditions.|在接近实际的条件下测量吞吐量。
bottleneck|瓶颈；限制整体性能的环节|Disk speed is the main bottleneck.|磁盘速度是主要瓶颈。
threshold|阈值；界限|Send an alert when usage crosses the threshold.|使用量超过阈值时发送警报。
peak|峰值；高峰|Traffic reaches its peak in the evening.|流量在晚上达到峰值。
average|平均值；平均的|The average response time is improving.|平均响应时间正在改善。
sample|样本；采样|Collect a sample every ten seconds.|每十秒采集一个样本。
utilization|利用率|Low utilization may indicate wasted capacity.|低利用率可能意味着容量浪费。`,
  },
  {
    id: 'debug-incident', title: '排查一次服务故障',
    description: '读日志、复现问题、隔离原因，再恢复服务。',
    task: '从错误日志定位故障，复现异常，缩小范围并记录解决方案。',
    entries: `log|日志；记录|Check the log for the first error.|查看日志中的第一个错误。
error|错误；误差|The error message includes a useful hint.|错误信息包含一个有用提示。
warning|警告；提醒|A warning does not always mean a failure.|警告并不总意味着故障。
failure|失败；故障|The failure affected only one server.|这次故障只影响了一台服务器。
exception|异常；例外|Handle the exception without losing the request.|处理这个异常时不要丢失请求。
trace|追踪；调用轨迹|The trace shows which step was slow.|追踪信息显示了哪个步骤很慢。
investigate|调查；研究|Investigate the issue before changing settings.|修改设置前先调查这个问题。
reproduce|复现；复制|We can reproduce the problem on a test server.|我们能在测试服务器上复现这个问题。
isolate|隔离；单独确定|Isolate the failing component first.|先隔离出发生故障的组件。
diagnose|诊断；判断原因|Use the logs to diagnose the problem.|使用日志诊断这个问题。
recover|恢复；重新正常运转|The service should recover after a restart.|服务应该在重启后恢复。
incident|事件；服务故障事件|Write a short report about the incident.|为这次故障写一份简短报告。
cause|原因；导致|Find the cause rather than hiding the symptom.|找出原因，而不是掩盖表面现象。
solution|解决办法；方案|Test the solution before applying it widely.|广泛应用前先测试这个解决方案。`,
  },
  {
    id: 'containers', title: '运行一个容器服务',
    description: '镜像、仓库、运行时和健康检查组成可重复部署的服务。',
    task: '从镜像仓库拉取指定版本，启动容器，设置资源限制并检查健康状态。',
    entries: `container|容器；隔离运行应用的环境|Run the application inside a container.|在容器中运行这个应用。
image|镜像；图像|The image includes the application and its dependencies.|这个镜像包含应用和它的依赖。
registry|镜像仓库；注册表|Push the image to a private registry.|把镜像推送到私有镜像仓库。
tag|标签；版本标记|Use a specific tag instead of latest.|使用明确的版本标签，而不是 latest。
pull|拉取；拉|Pull the image before starting the container.|启动容器前先拉取镜像。
push|推送；推|Push the new image after the build passes.|构建通过后推送新镜像。
layer|层；镜像层|Each layer adds files to the image.|每一层向镜像中添加文件。
runtime|运行时；执行程序所需的环境|The runtime starts and manages containers.|运行时启动并管理容器。
compose|组合；编排|Compose several services into one application.|把多个服务组合成一个应用。
service|服务；服务程序|The database service starts before the web service.|数据库服务先于网站服务启动。
process|进程；处理过程|Each process has a unique identifier.|每个进程都有一个唯一标识符。
namespace|命名空间；隔离名称或资源的范围|A namespace helps separate container resources.|命名空间帮助隔离容器资源。
health|健康状态；健康|The health check failed twice.|健康检查失败了两次。
graceful|平稳的；妥善的|Use a graceful shutdown to finish active requests.|使用平稳关闭来完成正在处理的请求。`,
  },
  {
    id: 'choose-gpu', title: '挑选一台 GPU 云主机',
    description: '根据显存、精度、带宽和兼容性选卡，避免只比较型号。',
    task: '按模型需求比较加速卡，检查驱动兼容性，并用基准测试验证推理性能。',
    entries: `GPU|图形处理器；常用于并行计算的加速器|This GPU has enough memory for the model.|这块 GPU 有足够的显存运行模型。
accelerator|加速器；加速计算的设备|The accelerator handles parallel operations.|这个加速器处理并行运算。
graphics|图形；图形处理|The driver supports graphics and compute workloads.|这个驱动支持图形和计算负载。
compute|计算；计算资源|Rent more compute only when necessary.|仅在必要时租用更多计算资源。
tensor|张量；多维数据数组|The tensor stores a batch of input data.|这个张量保存一批输入数据。
precision|精度；数值表示的细致程度|Lower precision can reduce memory usage.|较低精度可以减少显存使用。
bandwidth|带宽；单位时间的数据传输能力|Memory bandwidth affects model performance.|显存带宽影响模型性能。
core|核心；主要部分|The chip contains many processing cores.|这块芯片包含许多处理核心。
device|设备；装置|Select the correct device before starting.|启动前选择正确的设备。
driver|驱动程序；司机|Install a compatible driver for the GPU.|为 GPU 安装兼容的驱动程序。
compatible|兼容的；能共同使用的|This library is compatible with the new driver.|这个库与新驱动兼容。
benchmark|基准测试；比较标准|Run a benchmark with your actual workload.|使用你的实际负载运行基准测试。
inference|推理；用模型产生预测或输出|Inference uses the trained model to produce output.|推理使用训练好的模型生成输出。
comparison|比较；对照|Make a comparison using the same test settings.|使用相同的测试设置进行比较。`,
  },
  {
    id: 'cloud-billing', title: '控制 GPU 租用成本',
    description: '看懂按小时计费、额度、配额和预算，避免闲置消耗。',
    task: '估算一天的租用费用，设置预算与配额，并在任务结束后释放付费资源。',
    entries: `account|账户；解释|Check the account before creating a paid instance.|创建付费实例前检查账户。
balance|余额；平衡|The account balance is enough for one day.|账户余额够用一天。
credit|额度；抵扣余额；信用|The provider added a small amount of credit.|服务商增加了一小笔抵扣额度。
charge|收费；费用|The provider may charge for stored data.|服务商可能对存储的数据收费。
cost|成本；花费|Include storage in the total cost.|把存储费用算进总成本。
price|价格|Compare the hourly price before choosing.|选择前比较每小时价格。
hourly|每小时的；按小时的|The hourly rate does not include network traffic.|按小时计费的价格不含网络流量。
billing|计费；账单处理|Read the billing rules before renting a GPU.|租用 GPU 前阅读计费规则。
invoice|发票；账单明细|Download the invoice for your records.|下载发票以留档。
budget|预算|Set a budget for the experiment.|为这次实验设置预算。
quota|配额；允许使用的上限|The account has a quota of two GPUs.|这个账户的配额是两块 GPU。
demand|需求；要求|Prices may rise when demand is high.|需求高时价格可能上涨。
supply|供应；供给|Limited supply can reduce availability.|供应有限可能降低可用性。
discount|折扣；打折|The discount applies only to a long reservation.|这个折扣只适用于长期预订。`,
  },
  {
    id: 'move-dataset', title: '准备一份训练数据',
    description: '传输、解压、校验与分批处理，保证拿到的数据可用。',
    task: '下载数据集，验证校验和，解压到持久存储，再按批次送入处理流水线。',
    entries: `dataset|数据集|The dataset contains examples for training.|这个数据集包含训练用的样本。
upload|上传|Upload only the files you are allowed to share.|只上传你有权分享的文件。
download|下载|Download the archive to the data volume.|把压缩包下载到数据卷。
transfer|传输；转移|A slow connection makes the transfer take longer.|连接缓慢会让传输耗时更长。
format|格式；格式化|Check the file format before opening it.|打开文件前检查文件格式。
archive|归档文件；归档|The archive contains several data files.|这个归档文件包含几个数据文件。
compress|压缩|Compress the logs before uploading them.|上传前压缩日志。
extract|提取；解压|Extract the archive into a new directory.|把归档文件解压到新目录。
checksum|校验和；用于核验数据完整性的值|Compare the checksum after the download.|下载后比较校验和。
chunk|块；分块数据|Send a large file in smaller chunks.|把大文件分成小块发送。
batch|批次；一批数据|Process one batch at a time.|每次处理一批数据。
pipeline|流水线；串联的处理步骤|The pipeline cleans the data before training.|这条流水线在训练前清理数据。
cache|缓存；缓存数据|The cache avoids repeated downloads.|缓存避免重复下载。
shuffle|打乱顺序；随机重排|Shuffle the examples before each training pass.|每轮训练前打乱样本顺序。`,
  },
  {
    id: 'train-model', title: '跑通一次模型训练',
    description: '把训练参数、损失与验证放回同一条实验流程中理解。',
    task: '设置学习参数，观察损失变化，保存检查点，并用验证数据评估模型。',
    entries: `model|模型；模范|The model learns patterns from examples.|模型从样本中学习规律。
train|训练；火车|Train the model on a small dataset first.|先用一个小数据集训练模型。
parameter|参数；模型中可学习或可配置的数值|The model has millions of parameters.|这个模型有数百万个参数。
weight|权重；重量|Training changes the model weights.|训练会改变模型权重。
gradient|梯度；变化率方向|The gradient guides the parameter update.|梯度指导参数更新。
loss|损失；损失值|A lower training loss is not the only goal.|更低的训练损失不是唯一目标。
learning|学习；训练中的学习过程|The learning rate controls the update size.|学习率控制每次更新的幅度。
epoch|轮次；完整遍历训练数据的一轮|One epoch covers the entire training dataset.|一个轮次遍历整个训练数据集。
iteration|迭代；一次重复计算|Save a checkpoint every hundred iterations.|每一百次迭代保存一个检查点。
optimize|优化；使更有效|Optimize the settings after measuring the result.|测量结果后再优化设置。
converge|收敛；逐渐趋于稳定|The loss may converge after several epochs.|损失可能在几轮后收敛。
checkpoint|检查点；可恢复的中间状态|Resume training from the latest checkpoint.|从最新检查点恢复训练。
validation|验证；用于调参与检查的数据评估|Validation helps detect overfitting.|验证有助于发现过拟合。
evaluate|评估；评价|Evaluate the model on unseen examples.|使用未见过的样本评估模型。`,
  },
  {
    id: 'serve-model', title: '把模型变成 API',
    description: '从提示词到流式响应，理解并发、超时与重试的代价。',
    task: '调用推理端点，限制输入长度，观察流式输出，并妥善处理超时和重试。',
    entries: `endpoint|端点；API 的调用地址|Send the request to the inference endpoint.|把请求发送到推理端点。
token|词元；文本处理单位；令牌|A token is not always a complete word.|一个词元不一定是一个完整单词。
prompt|提示词；提示|Write a clear prompt with a specific task.|编写清晰且任务明确的提示词。
output|输出；产出|Validate the output before saving it.|保存前验证输出。
input|输入；投入|Limit the input to the expected format.|把输入限制为预期格式。
context|上下文；背景|Include enough context to explain the task.|提供足够的上下文来说明任务。
stream|流；流式传输|Stream the answer as it becomes available.|答案生成后逐步流式传输。
concurrent|并发的；同时进行的|The server handles several concurrent requests.|服务器处理多个并发请求。
queue|队列；排队|New jobs wait in the queue.|新任务在队列中等待。
timeout|超时；等待时间上限|Set a timeout for each external request.|为每个外部请求设置超时时间。
retry|重试；再次尝试|Retry only when it is safe to repeat the action.|只有在重复操作安全时才重试。
rate|速率；比率；费率|The rate limit protects the service.|速率限制保护这个服务。
scalable|可扩展的；能随需求增长的|A scalable service can handle growing demand.|可扩展的服务能应对增长的需求。
burst|突发；短时间的集中增加|A sudden burst of traffic filled the queue.|突发流量让队列排满了。`,
  },
  {
    id: 'database-records', title: '把进度写进数据库',
    description: '用表、记录和事务保存真实进度，而不是只保存在当前浏览器。',
    task: '查询已有记录，安全更新学习进度，并用唯一约束防止重复写入。',
    entries: `database|数据库|The database stores your learning progress.|数据库保存你的学习进度。
table|表；桌子|This table contains one row per word.|这张表每个单词对应一行。
row|行；一条数据记录|Each row has a unique identifier.|每一行都有一个唯一标识符。
column|列；栏目|The date column records the next review day.|日期列记录下一次复习日期。
query|查询；询问|The query returns only overdue words.|这个查询只返回已到期的单词。
index|索引；目录|An index can make this query faster.|索引可以让这个查询更快。
transaction|事务；一组整体成功或失败的操作|Save both changes in one transaction.|在同一个事务中保存两项更改。
consistent|一致的；连贯的|Keep the stored progress consistent across devices.|让各设备保存的进度保持一致。
constraint|约束；限制条件|A constraint prevents duplicate identifiers.|约束可以防止重复标识符。
unique|唯一的；独特的|Each review event needs a unique identifier.|每个复习事件需要一个唯一标识符。
insert|插入；添加|Insert a new record after the first review.|首次学习后插入一条新记录。
update|更新；使保持最新|Update the due date after a successful review.|成功复习后更新到期日期。
delete|删除|Do not delete progress without a backup.|没有备份时不要删除进度。
persist|持久保存；持续存在|Persist the result before showing success.|显示成功前先持久保存结果。`,
  },
  {
    id: 'team-handoff', title: '用英语交代一次变更',
    description: '把技术动作变成清楚的说明：现状、影响、建议和后续。',
    task: '写一条简短变更说明，解释影响、确认状态，并提出下一步改进建议。',
    entries: `issue|问题；议题|Describe the issue in one clear sentence.|用一个清楚的句子描述问题。
impact|影响；冲击|Explain the impact on current users.|解释对现有用户的影响。
status|状态；情况|Check the status before sending the update.|发送更新前检查状态。
progress|进展；进度|Report the progress of the migration.|报告迁移进度。
confirm|确认；证实|Confirm that the new version is running.|确认新版本正在运行。
suggest|建议；暗示|Suggest a small change that reduces risk.|提出一个能降低风险的小改动。
explain|解释；说明|Explain why the service needs more memory.|解释服务为什么需要更多内存。
compare|比较；对照|Compare the results before making a decision.|作出决定前比较结果。
improve|改善；提高|The change should improve reliability.|这个改动应当提高可靠性。
reduce|减少；降低|Reduce unnecessary requests to save money.|减少不必要的请求以节省费用。
increase|增加；提高|Increase capacity before the expected peak.|在预计高峰前增加容量。
reliable|可靠的；可信赖的|A reliable backup can be restored successfully.|可靠的备份能够成功恢复。
efficient|高效的；效率高的|An efficient process avoids repeated work.|高效的流程避免重复工作。
maintain|维护；保持|Maintain a short guide for future changes.|维护一份简短指南供未来变更参考。`,
  },
];

function wordId(term: string): string {
  return `w-${term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
const words = new Map<string, Word>();
export const seedScenes: Scene[] = sceneData.map(({ id, title, description, task, entries }) => {
  const wordIds: string[] = [];
  for (const line of entries.trim().split('\n')) {
    const [term, meaning, example, exampleZh] = line.split('|');
    if (!term || !meaning || !example || !exampleZh) throw new Error(`Invalid original seed row in ${id}`);
    const identifier = wordId(term);
    const previous = words.get(identifier);
    if (previous) {
      if (!previous.sceneIds.includes(id)) previous.sceneIds.push(id);
    } else {
      words.set(identifier, {
        id: identifier, term, meaning, example, exampleZh,
        tags: ['通用与技术交叉', id === 'choose-gpu' || id === 'train-model' || id === 'serve-model' ? 'GPU / AI' : id === 'team-handoff' ? '通用表达' : '计算机 / 云服务'],
        sceneIds: [id], source: SOURCE,
      });
    }
    wordIds.push(identifier);
  }
  return { id, title, description, task, wordIds };
});

export const seedWords: Word[] = [...words.values()];
export const lexiconInfo = {
  name: '云与计算 · 通用场景词库',
  description: '原创英汉释义与双语例句，以真实任务串联通用英语、服务器部署和 GPU 云计算。支持追加自己的 JSON / CSV 词库。',
  source: SOURCE,
  license: 'CC0-1.0',
  coverage: `${seedWords.length} 个词条 / ${seedScenes.length} 个任务场景。包含四级学习也常见的通用表达与技术词；不是完整四级词库，也不代表已逐词核对官方考试范围。`,
};
