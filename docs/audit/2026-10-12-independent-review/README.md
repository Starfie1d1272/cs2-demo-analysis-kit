# 独立复审：2026-10-10—10-12 凌晨

审查对象 `Starfie1d1272/cs2-demo-analysis-kit`。时间窗为北京时间 10-10 00:00 起，包含 10-12 01:38:11 已给出的收尾。以服务器读取核验 main=`126f3afed09d5c2278cd6ad9e8306fa36aef294f`；时间前基线=`15f5e319e60d16065054749fbd3d4e54a3588526`（10-06 最后提交）；正式 v0.8.5 tag=`6562abd058e4a4d5c2e606db4e859db55465a8df`。17 个 main 提交/合并 PR，154 个净变更文件。PR #72/#73 是 10-10/11 范围的一部分，不能只看 #84–94。`commits.tsv` 和逐提交 `.patch` 保存完整期间清单；`files.csv` 逐文件映射到这些提交，清单覆盖不等于每文件都有真机效果证明。分支上的未合并旧 PR #6 不属于期间交付；它仍需 #3 capability reconciliation。

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

独立分支 `fix/independent-audit-receipts-secrets`：Studio在终态/link前核对map ID和raw SHA，错receipt失败但下一队列项继续；运行脱敏补credential/passwd/Basic及多词密码，Python handler+export再次保护；JSON parser仅提取语法类别和终端数字位置。无新增UI/API、无Evidence payload/hash改动。

新定向67 TS、64 Python、typecheck、ruff、diff-check通过；原五条反证改后5/5通过（adversarial-after.log），Python三输入均全值脱敏。两次实现迭代失败日志也保留在本地支持目录：首次成功fixture固定receipt target、加严脱敏导致JSON位置信息丢失、TS常量类型/ruff问题，修正后才得到上述结果。自身修复未宣称独立审查通过，Ready PR交父会话独立协调；未经该审核不merge。
