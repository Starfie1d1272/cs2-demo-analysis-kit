# 独立复审：2026-10-10—10-12 凌晨

审查对象 `Starfie1d1272/cs2-demo-analysis-kit`。时间窗为北京时间 10-10 00:00 起，包含 10-12 01:38:11 已给出的收尾。以服务器读取核验 main=`126f3afed09d5c2278cd6ad9e8306fa36aef294f`；时间前基线=`15f5e319e60d16065054749fbd3d4e54a3588526`（10-06 最后提交）；正式 v0.8.5 tag=`6562abd058e4a4d5c2e606db4e859db55465a8df`。17 个 main 提交/合并 PR，154 个净变更文件；另有期间未合并依赖 PR #77（1个提交、2文件），全部纳入。PR #72/#73 是 10-10/11 范围的一部分，不能只看 #84–94。`commits.tsv` 和逐提交 `.patch` 保存完整期间清单；`files.csv` 逐文件映射到这些提交，清单覆盖不等于每文件都有真机效果证明。旧 PR #6 创建/更新均在7月，不属本时间窗；它仍需 #3 capability reconciliation。

先读仓库 AGENTS.md、module-boundaries、fixture-verify skill。所有验证是本地、合成或只读 GitHub；没有用户 Windows、生产库、发布、原始 dump、真实 token 操作。旧作者的评论只用于寻找线索，证据强度依据源码和重新运行检查判断。

## 已立即回报的确定问题

1. **P1 / 回执身份缺口（Studio）**：`apps/dak-studio/src/lib/rivalhub-import.ts:483–494` 在 POST 后直接以 status 标终态并 link 所选 map，没有比较 `response.matchMapId/demoSha256` 与本次对象。合成正确 shape 的 `synced` 回执指向 other-map / b*64，而本次为 target / a*64，仍调用 linkMap(series-target,target,entry)。`adversarial-before.log` / `receipt-repro.test.ts` 证明本机制，不能推定线上 server 已经发错回执。Uploader 对同类边界已有身份核验+events 再确认。恢复应阻止本地写入并引导先核对远端，而不是将 HTTP 200 直接视作本次业务成功。
2. **P1 / 运行日志脱敏不完整**：`packages/rivalhub-upload/src/diagnostics.ts:4–17`、`python/src/cs2dak/diagnostics.py:46–57` 忽略 credential/passwd；多词 password 仅抹首词；TS 裸 Basic 值未抹。错误→normalizeDiagnostic→UI / report_ui_error→SafeFormatter / export_logs 可达。`adversarial-before.log`（四种 TS 输入均失败）和 `python-secrets-before.log`（三个合成输入残留）证明。只使用 synthetic 值，无已有真实泄漏证据。Evidence 的独立 wire sanitizer 比运行日志严格；不能拿 Evidence 测试覆盖运行日志。

## 期间 PR/commit 覆盖矩阵

以下每行都追目标→真实入口→权威源→失败恢复→实际证据边界。源码行号以 frozen head 对应 GitHub 文件为准；完整差量见各 commit patch，具体测试见相邻 *.test.ts / python/tests，以及本次日志。

|PR / commit|用户目标、触发和 UI/操作|权威源与恢复/安全核对|当前证据及未验证边界|
|---|---|---|---|
|#73 / 9852ca1|空启动能进入可操作桌面|pywebview 真实方法反射；窗口为私有 _window，避免递归 COM 属性扫描；取消日志对话框后正常退出|真实反射测试重新通过；Windows CI冻结包两次 WM_NULL/桥接/对话框/退出。只证明这些动作，不证明解析上传；原 0.8.4 deadlock 不再以启动结果作完整业务结论|
|#72 / 4e442d8|完整标准 Windows安装、目录/快捷方式/修复升级卸载；启动错误可定位|Inno文件所有权、空目录保护、x64、.NET/WebView2 registry preflight；Python导入前日志/inner cause；拒绝降级保留资料|Windows installer/startup历史实际 artifact CI存在；本地源码合同测试通过。尚缺人工权限/占用/中断/缺runtime；#75完整解压后Loader需现场内因，不能与缺python312.dll或死锁合并归因|
|#80 / ffac376|解析实际 Demo，parser异常形成终态|PyInstaller显式 pyarrow/Polars/runtime hidden imports；Studio import在try内，受控Rust panic转error；其它BaseException不吞|145 Python含依赖ImportError/Panic注入；打包启动CI不运行真实.dem parser。因此 frozen parser功能仍未实测|
|#81 / 2f18ef1|真实首因和安全诊断导出；worker/HTTP失败可解释|共享窄safe诊断、轮转/备用目录导出；worker失败保留primary/fallback；cleanup次级不覆盖结果|相关TS/Python重跑通过；新增P1证明运行脱敏承诺仍不完整；server observability与requestId传播端到端仍未验证|
|#82 / 0296acf|QA warning具体原因及richKills依据可看|Core唯一QA；extensions cs2dak/diagnostics v1、64条截断、安全字段、deterministic counts；QA errors阻上传|真实ZIP/evidence和safe diagnostics tests；历史payload不写回；接收端现场四warning实际code未取得，不能从4或partial猜原因|
|#83 / 6562abd|正式0.8.5发行|release tag+资产digest+R2 manifests；应用和npm独立version stream|Release run38110916625成功、10个GitHub assets元数据存在；新#84–94不在正式包。无签名/公证完成证明；R2本环境只读访问403，不能推断所有用户访问失败|
|#84 / 8a8b482|已接收后断网仅确认；授权取消不被晚回写复活；镜像cause|POST receipt保留；events hash/status双核验；same evidence key；pairing generation+旧写入/rollback串行；source failure列表及cancel独立终态|真实ZIP+合成events pipeline tests、pairing race、Pythoninstaller/updater测试；新P1指出Studio未采用同等response identity核验；授权/完整上传真机及旧Studio安装崩溃原子性不在证明内|
|#85 / 770c4c4|同名队不混身份；所有consumer统一frozen facts|Core tournament-facts owner，explicit stable team/player key；unbound本地match-scoped observed-team；cache v6失效旧label rows|same-label/rename/orientation及真实ZIPtests；本地teamRenames只标签。未证明用户旧资料全部重建成功，未对生产历史Evidence回填|
|#86 / 0166078|不让旧aggregate/TK/FK口径误挡合法Demo|删除playerStats oracle；单一event事实owner验证supplied facts；TK victim死亡保留、TK不记击杀，首个有效敌对击杀成对FK/FD；保留源QA|performance facts/validation/QA/tests通过，core major changeset明确移除API；不是第二套独立解析器一致性证明，真实四warning成因仍未知；大型Demo signature CPU/RSS未实测|
|#87 / 333ee75|凭据absence与拒绝区分，用户得到可执行恢复|Win32仅1168作absent；macOS exit category；secret argv/blob异常脱离context；保存失败恢复旧credential+metadata|合成OS读写/拒绝/metadata rollback测试重新通过；真实机器Credential Manager/Keychain访问条件仍未知，不要求与scope无关实机才能认定代码机制|
|#88 / 4a8333d|非法version零写入、损坏uv.lock可恢复|唯一sync owner，canonical x.y.z，先全目标校验再write，失败逆序恢复已尝试文件|node:test14通过；当前版本no-op验证；仅runtime undo，不能保证kill/disk永久故障事务。#48 B/C provenance仍缺|
|#89 / fc6ee5d|替换失败/取消不丢旧ZIP/facts|相关match/entry/rawSHA锁、取得锁后重读survivor；settle全部写入再checkpoint restore；精确matchId+tab删除|library persistence并发/取消/失败回归和native null→undefined通过；checkpoint跨namespace非crash原子，长corpus全表entries扫描成本和现场重启未验证|
|#90 / ec2fbb0|外部安装maps可实际调用|compiled ESM+d.ts四原入口，实际tgz干净npm consumer；JSON assets齐全；tri-assets import statSync修require false|本次maps-package-smoke四入口调用+strict NodeNext成功；当前tgz仍1.0.0、本次无publish；#47calibration subpath/Train/map-pool未实现|
|#91 / 9f0cbd8|状态失联保留解析，少点击恢复同任务|ExportPolling只read，不start/cancel/cleanup；unknown/query/stall显示uncertain，recheck同job；Studio去掉一分钟结果自动清理|timer/race/late reply/long progress注入测试通过，UI入口可达。协议无heartbeat，进度不变无法证明parser活着；无完整任务取消/跨重启恢复承诺|
|#92 / 7266451|安装失败容易取得本机日志|Inno SetupLogging，{log}真实路径、固定stage/lastStage、目录/runtime失败指导，分享前人工脱敏|Windows默认日志和拒绝路径CI成功；实际日志为本机原始Inno日志，非Python safe export；人工缺runtime/权限/占用/中断页面未取截图|
|#93 / 0cf0038|远端已覆盖时唯一raw SHA恢复本地关联|refresh canonical64hex、local与remote重复fail closed，preserve explicit live selection；link失败保持remote终态、只retry link|events/hash/dup/idempotent/tests通过；没有现场59图资料，不知道原54/59 owner path，不把源码repair等同59/59已收敛；新P1错receipt不得建立link|
|#94 / 126f3af|optional降级/tri/选择fallback原因不丢且不弹冗余错误|loader observer隔离；JSON parse仅语法位置避免原文；tri主线程/worker共同owner；fallback诊断不改选择/参与者验证，正常cancel区别全拒绝|optional/worker/tri/selector及完整套件通过；native实际dialog失败及权限网络现场未验证；Node CLI tri/callout-grid不在该PR范围|

## 开放 issue 逐项验收

10个现存OPEN全部取正文和完整评论保存在 issues.json。本次没有任何一个满足其**完整**DoD，故没有为了清理而关闭；也不把每个源码scope一律要求无关实机。源证据已完成的子项承认完成，具体剩余如下。

|issue|优先级 / 本次结论|已验证和阻止关闭的具体缺口|
|---|---|---|
|#75|P1，保持OPEN|preflight+cause/log基础存在；缺故障机器Loader inner exception、加载目标、目录/架构/runtime实际核验；不能归因为单独EXE缺DLL或死锁|
|#76|P1，保持OPEN|完整安装/修复/升级/卸载/Unicode CI；剩人工runtime/权限/中断/占用及冻结包完整业务链路，不拿普通浏览器合成替代|
|#79|P1，保持OPEN|A/B/C/D/F/G多路径源码+测试成立；运行脱敏新P1；接收端admin已源码核对保留current/stored逐条diagnostics；完整跨端故障请求关联/现场验收仍缺；不把12组所有路径已完工|
|#49|P1，保持OPEN|unique canonical SHA refresh和remote成功/local link失败恢复具备；错receipt新P1；仍缺原54/59实际owning path与当前59/59本地收敛证据|
|#48|P1/P2，保持OPEN|A组fail-safe14测试；B/C buildRevision/buildDirty、artifact/UI可见provenance和operator summary尚未实现，不是缺一个无关真机验收|
|#47|P0/P1，保持OPEN|四entry compiled tarball consumer已证；calibration窄入口及isolation不存在，Train/version/map-pool与spatial coverage未改，真实registry目标1.1.0未发布|
|#64|P1，保持OPEN|maps vertical slice/tournament dist已有；其余core/contract/cohort/presentation/react公共包仍source TS合同，完整传递闭包与consumer governance未收口；不机械全仓重构|
|#3|P1，保持OPEN|runtime import undo及若干diagnostics已证；旧#6 capability矩阵、50+真实corpus性能、native重启/rollback、真实Evidence/replay跨match恢复等仍缺|
|#54|P2，用户已延期|won-round/assist/weapon-context/late/saved/pistol additive facts设计未完整实现；尊重延期，不列为本轮必修|
|#17|P3，用户已延期|Map Book/assignment/Default/Protocol/Play/Match Sheet未交付；保留人工知识owner，尊重延期|

特别核对 #59：仓库 #59 是已合并依赖PR，不是开放issue；#49中的“59图”是另一概念。#69/#78当前已CLOSED，源码/测试支持对应窄修复；#78现场旧四warning没有被本次重建，旧诊断继续保留而不猜原因。接收端不同版本扩展兼容仅能在协议核对证据范围内认定，完整网站取回需另验。

## 重新运行和证据级别

- Frozen main：[CI 38160477799](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/38160477799) 三组success；Windows最后PR精确head f900494 的 [startup38159594317](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/38159594317) / [installer38159594277](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/38159594277) success。不同SHA不得冒充main精确包验证。
- 本地：frozen install成功；typecheck/build成功；sample analyze成功；129 files / 825 fast tests、8真实ZIPintegration、145 Python（含真实pywebview反射）通过。sync-version14与uploader-release-contract日志保存；maps实际tgz clean consumer四入口runtime+NodeNext通过。
- 首次失败日志保留：analyze缺maps dist、TS50文件module resolution失败、Python缺webview extra；前者与并行build清dist/缓存状态有关，不能由第二次通过反推成产品原因；修正环境先build、安装gui后才得上述完整成功。没有隐去失败。
- 新定向反证：5条失败断言（1个receipt+4个秘密）和Python三输入；机制确定，线上触发频率和真实泄漏未知。后续修复必须重新执行并保留before/after，不自称独立审核自己的修复。
- GitHub release元数据/digest与workflow source已核对；R2两manifest本环境HTTP403，保留为获取边界，未用私有凭据绕过。Windows签名/macOS公证无完成证据，hash/HTTPS不等于作者签名。npm SDK由changesets独立发布，桌面tag不证明SDK registry已有新API；当前core major changeset应使receiver/client版本明确兼容。
- 截图只会标为Linux Chromium + mock native/transport +真实ZIP的合成UI，不证明用户Windows、OS存储或真实server写入。真实包Startup CI没有parse/upload步骤，正式包与main不可混写。

后续只做两个已确认的窄P1修复；不扩展地图/Coach/sufficient-facts、不发布、不生产回填。修复Ready PR须父会话协调独立审查后再按原授权合并。

## 协议独立核对补证

仅为必要合同核对，只读 RivalHub `e9f3e11297aa755a9cf2b91f6044eefc6b4c1e95` 的 AGENTS.md、Evidence contract/diagnostics/safety、submit lineage 和 admin projection。当前 receiver 的 QA summary 仍strict，diagnostics通过命名空间扩展独立校验，64条/omitted及richKills counts与摘要一致性受检；submit的scope授权、target validation、payload SHA、幂等key及lineage仍在服务端事务边界。admin仍由current validation决定blocking动作，另外保留current/stored全部diagnostics；不是以文案名单删除历史诊断。

用实际浏览器场景生成的真实ZIP Evidence调用**纯receiver schema**（没有DB/import server runtime），新diagnostics payload接受，删除扩展的历史shape接受，故意改omitted计数拒绝，结果见 receiver-contract.log。该样本0 warnings，只证明对应当前源码合同，不能证明原四warning内容、生产已部署这一head、权限/DB事务或旧新版所有lineage分支。没有操作RivalHub代码或远端数据。

合成UI截图 `uploader-synthetic-needs-attention.png` 已人工查看；请求链为 GET events→POST evidence（deterministic key）→GET events，UI明确“数据已送达/需要处理”，完成数仍0。桥接、凭据与server transport模拟，仅ZIP真实；不作Windows现场完成证据。

## 两项修复交付

独立分支 `fix/independent-audit-receipts-secrets`：Studio在终态/link前核对map ID和raw SHA，错receipt保留待确认，下一队列项继续；运行脱敏补credential/passwd/Basic及多词密码，Python handler+export再次保护；JSON parser仅提取语法类别和终端数字位置。沿用现有批处理面板与刷新按钮，仅补待确认状态和授权仍在时的刷新重试入口；无新增API、无Evidence payload/hash改动。

新定向67 TS、64 Python、typecheck、ruff、diff-check通过；原五条反证改后5/5通过（adversarial-after.log），Python三输入均全值脱敏。两次实现迭代失败日志也保留在本地支持目录：首次成功fixture固定receipt target、加严脱敏导致JSON位置信息丢失、TS常量类型/ruff问题，修正后才得到上述结果。自身修复未宣称独立审查通过，Ready PR交父会话独立协调；未经该审核不merge。

## 未合并期间 PR 与安全信息边界

补核全部OPEN PR：#6 最后更新时间为2026-07-31，旧capability reconciliation仍由#3；#77创建10-10、更新10-11，因此本次也纳入。#77 head=`618a21380bc5b78fe0bf00ee495805353b1bc9c7`，单提交，仅改infra/event-upload-worker/package.json和package-lock.json；wrangler4.147→4.149、sharp0.35.4→0.35.5以及workerd/esbuild/libvips/miniflare对应传递更新，没有Worker业务源码delta，所有resolved来源registry.npmjs.org。独立临时worktree执行npm ci --ignore-scripts、tsc --noEmit、wrangler deploy **--dry-run**（移除Cloudflare凭据、禁metrics）成功，输出明确dry-run退出；没有发布或接触实际R2。当前root CI不直接覆盖infra该npm子工程，因此不以root绿灯替代该验证。保持原PR开放交父协调，不纳入0.8.5已交付能力。

push时GitHub通知default branch存在一个High Dependabot告警#38，但GET安全告警API返回integration 403。无法读取包/版本/漏洞和可达性，不能断言它就是#77或已修复。父协调如有安全权限应继续核对；本次不附凭据、不尝试绕过授权。此为访问边界，不是auto-review拒绝。


## PR #95 独立复审返修

父会话独立复审否定了第一次修复的两个组合边界，已保留其反证并返修，不能以第一次定向绿灯视为验收通过：

- **Python P1**：合成 `password="https://a\";synthetic-private" reason=连接失败` 经真实 SafeFormatter→FileHandler→export_logs，在旧 head `4bc97bc` 仍残留合成私密值。凭据完整值现在先于 URL 变换解析，`[redacted]` 分支防止导出二次处理吞原因；`review-combination-before-after.log` 显示旧版泄漏、新版未泄漏且保留安全原因。并非真实用户凭据。
- **TS P2**：第一次修复的第二轮 unquoted 规则重匹配 placeholder，吞掉 quoted 密码后的安全中英文原因。现在同一次替换按 quoted值/placeholder/unquoted值分支处理；`review-ts-combination-before-after.log` 显示原因恢复且重复处理幂等。对没有引号的凭据仍保守抹除整个不明确的值段，后接路径标记也可能被省去；tri 回归核验 TLS 原因存在且路径/秘密均不存在，不能要求保留这个无位置内容的标记来降低脱敏。
- **回执恢复**：错 map/hash 回执保留 `unconfirmed` 和本次 season/match、目标 map、raw SHA、local entry/series、幂等键。新 GET 的 season/match/map/hash 均匹配且状态为 synced/needs_attention 才确认并关联；wrong identity、processing/缺 map 均保持待确认。GET 失败不抹待确认项；恢复过程没有第二次 POST。测试也覆盖确认后 local link失败、仅修复link以及重复刷新不重复link。
- **真实 owner 边界**：本地 `event:rivalhub:<season>:series:<match>` 和远端 season/match ID 不相同，确认使用远端字段、关联使用本地字段；新增 namespaced 回归，避免简化 mock 掩盖。刷新失败状态保留授权记录时，既有 EventsView 现在保留“刷新赛事”重试入口，避免再次连接才可恢复。
- **UI 证据**：`studio-synthetic-unconfirmed-refresh.png` 是真实 React 组件+CSS在 Chromium 中的合成状态，已人工检查；点击既有“刷新赛事”按钮执行真实组件回调一次。此截图只证明显示和按钮可达，不证明 App 异步恢复、native bridge、Windows包或线上服务器的整链实效。App 的 refresh/批处理状态接线另由源码和服务逻辑回归审查。

**保留边界**：待确认事务只保留当前批次会话；关闭结果/退出应用后没有持久化恢复账本。现有唯一 raw SHA 的赛事刷新 owner 仍可修复部分本地关联，但不能据此宣称原 #49 的54/59已达到59/59。没有操作用户 Windows、生产库、发布、回填或上传原始内存 dump/凭据。#48/#47 的额外修复交父会话其他独立工作线，不在本次返修添加功能。

返修新增代码继续等待父会话独立复审；自身测试与源码核对不称为独立审核通过。

最终本地检查：130 files / **844 fast TS**、**8真实ZIP integration**、**146 Python**、sample analyze、全工作区typecheck、Studio build、ruff与diff-check通过；build保留既有chunk-size warning。完整fast首次返修运行发现tri路径占位符预期差异，记录在本地 `review-followup-all-ts.log`；上述脱敏安全取舍明确后再运行才得到最终844通过。


## PR #95 第二次独立复审：literal marker 后缀

父会话在 `519db1cf` 指出 `[redacted]` 备选缺值结束边界。本次新增反证通过真实 `normalizeDiagnostic(Error)` 和 Python `SafeFormatter→FileHandler→export_logs`，各5种合成输入在修前全部失败：marker紧接秘密、marker后空格/制表符再接秘密，以及带分号分隔安全中英文reason的组合。修前TS旧回归30条通过并不能否定新增5条泄漏，Python亦同。

最终取消裸 `[redacted]` 特殊备选，原始marker和后缀始终按普通unquoted值一起脱敏。quoted凭据的替换结果保留原引号，因此下次按已有quoted解析边界处理，可保留后面的安全原因，无需相信marker来自上一轮，也无需引入新的reason字段语法。没有明确引号/分隔符的值段继续保守整体抹除，不以一个空格推定秘密结束。新增 `password=[redacted] reason=synthetic-private` 反证防止把貌似reason字段的秘密后缀特殊放过。quoted安全中英文原因、明确分隔原因、TLS前置原因均保留；二次normalize和实际导出再脱敏幂等。

`marker-runtime-before-after.log` 对精确旧head `519db1cf` 与最终源码重放全部6例：真实TS normalizeDiagnostic和Python实际handler/export各从6/6泄漏变为0/6；安全原因保留且两端幂等。旧head同时幂等又泄漏，证明幂等本身不是安全验收。之前PR返修章节描述的是当时实现，这里的无裸marker分支方案取代它。

证据：`marker-ts-before.log` / `marker-python-before.log` 各5失败；`marker-ts-after.log` 包含36 diagnostic+8 client通过；`marker-python-after.log` 23通过，包含真实文件落盘和导出两端检查。仅使用合成秘密；未将旧head绿灯、自身回归通过称为独立验收。回执恢复与其他issue实现本轮未修改。

本轮最终完整检查：130 files / **850 fast TS**、**8真实ZIP integration**、**152 Python**，另 sample analyze、全工作区typecheck/build、ruff与diff-check通过。新增修复仍需父会话独立复审，未merge或发布。


## PR #95 第三次窄修：结构化异常日志重复脱敏

接管时只使用已推送源码/报告重新核验：远端 PR95 head 为 `08b565d0dcefea92e609e00f8c8f5ab8b5fc1e25`，main 为 `6beb85c876c8f3f6d18d6403ac39798a52b9fb46`。没有声称访问旧终止任务的未推送材料；沿用 PR95。先合并该 main，保留 maps #97、Worker #77、provenance #96 和 PR95 原有全部改动，merge 无冲突。

**P2 已实际复现**：`log_failure(logger, ValueError('password="secret words" reason=connection refused'))`，以及真实 `logger.exception→SafeFormatter→FileHandler→export_logs`，在 `519db1cf` 保留英文/中文安全原因，在 `08b565d0` 两种入口均吞掉原因并破坏 JSON（未见该输入秘密残留）。`structured-runtime-probe.py` 精确加载两版已推源码与当前源码，结果见 `structured-runtime-before-after.log`；运行方法为 `cd python && uv run python ../docs/audit/2026-10-12-independent-review/structured-runtime-probe.py`。旧 head 原本已幂等，再次证明幂等不能代替原因/安全断言。

修复 owner 仍为 Python diagnostics 的共享重复脱敏边界：完整 JSON 对象先解码，对字符串字段套用同一脱敏策略，凭据字段无条件抹除，再序列化；处理 message、cause、嵌套 causes 的转义引号，不引入可信 marker、额外 reason 语法或单输入正则补丁。原始 quoted/unquoted 凭据先消费完整值，保护 multiline 和看似 JSON 的秘密值；不改变不明确 unquoted 值保守整体抹除的政策。字段名后缀保持原有凭据识别范围（例如 user_password）。formatter 和 export 两端仍重新检查；没有跳过已脱敏对象，也不写日志信任标记。

新增三入口 × 五组合的真实文件落盘/导出回归：log_failure、logger.exception、未经信任的 raw JSON，覆盖 quoted 多词、escaped URL 引号、伪造 marker、tab、假 reason 秘密后缀、nested credential/user_password；检查秘密全值不残留、英文/中文原因在 message/causes/cause 中存在、JSON可解析、重复脱敏幂等。第一轮新增15组时旧实现 **6失败/32通过**，保存 `structured-python-before.log`；另补4个 multiline/JSON-looking credential 与混合日志保护回归，最终 diagnostics **42通过**，全仓 **171 Python通过**。原有全部 secret/marker/receipt 回归保留。

最终验证：真实 TS normalizeDiagnostic/client/Studio import 定向 **74通过**；全量 **132文件/862 fast TS**、**8真实ZIP integration**、**171 Python**；全工作区 typecheck/build、release-policy、21项 Node release/provenance 合同、ruff、diff-check通过。实际 CLI `analyze:sample`、maps 五入口 clean tarball consumer/strict NodeNext/去空间资产 calibration、compiled tournament 和 clean tarball consumer 通过。build 保留既有 chunk-size warning。日志以 `structured-*` 保存。

保留环境失败：首轮 test:all 缺 maps 编译物产生28文件导入失败/2 CLI断言失败；第二轮与 maps-package-smoke 自带的 maps build 并行，build 会清 dist，出现2文件导入失败/2 CLI失败，已中断该轮（exit130）。完成构建/打包检查后串行重跑 fast 和 integration，得到上述最终全部通过。第二轮竞争是验证调度失误，不作为产品回归；没有删除失败记录或将其算作通过。

本轮只改 diagnostics、回归与证据；未新建 PR、未正式发布/生产回填/操作用户 Windows 或上传凭据，只用合成 fixture。现有 PR 工作流的 Windows CI不等于用户机器验收，也未手动 dispatch Windows。仍交父会话独立复审，未自行将修复称为独审通过或合并 main。
