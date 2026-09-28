import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, FileUp, Link2, LoaderCircle, Download, AlertCircle, ChevronRight } from "lucide-react";
import { normalizeBaseUrl, uploadDemo, type UploadUpdate, type RivalHubMatchCandidate } from "@cs2dak/rivalhub-upload";
import { client, delay, exportZip, native, nativeApiReady, type Connection, type DemoFile } from "./native";
import { explainError } from "./errors";
import "./style.css";

type Task = DemoFile & UploadUpdate & { error?: ReturnType<typeof explainError> };
const labels = { waiting: "等待", parsing: "解析", matching: "匹配", selecting: "选择比赛", uploading: "上传", done: "已完成", needs_attention: "需要处理", failed: "失败" };
const official = "https://match.starfie1d.top";
export default function App() {
  const [connection, setConnection] = useState<Connection>({ baseUrl: "", connected: false });
  const [address, setAddress] = useState(official);
  const [editing, setEditing] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [pairingUrl, setPairingUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState<ReturnType<typeof explainError> | null>(null);
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<{ file: string; candidates: RivalHubMatchCandidate[] } | null>(null);
  const resolver = useRef<((candidate: RivalHubMatchCandidate | null) => void) | null>(null);
  const pairingGeneration = useRef(0);
  const running = useRef(false);
  const initialized = useRef(false);
  const report = (error: unknown) => setProblem(explainError(error));
  useEffect(() => {
    const init = () => {
      const api = window.pywebview?.api;
      if (!nativeApiReady(api) || initialized.current) return;
      initialized.current = true;
      setReady(true);
      void api.connection().then(value => { setConnection(value); setAddress(value.baseUrl || official); }).catch(report);
    };
    window.addEventListener("pywebviewready", init);
    init();
    return () => { window.removeEventListener("pywebviewready", init); pairingGeneration.current++; };
  }, []);
  async function connect() {
    const generation = ++pairingGeneration.current;
    setProblem(null); setPairing(true); setNotice("正在打开授权页面…");
    try {
      const baseUrl = normalizeBaseUrl(address);
      await native().configure(baseUrl);
      const start = await client.startPairing();
      if (generation !== pairingGeneration.current) return;
      if (normalizeBaseUrl(start.authorizeUrl) !== baseUrl) throw new Error("PAIRING_URL：授权页面与连接的网站不一致");
      const expires = Date.parse(start.expiresAt);
      if (!Number.isFinite(expires)) throw new Error("PAIRING_EXPIRY：网站返回了无效的授权有效期");
      setPairingUrl(start.authorizeUrl);
      await native().open_website(start.authorizeUrl);
      setNotice("请在浏览器登录 RivalHub 并确认授权，然后回到这里。此窗口会自动继续。");
      while (generation === pairingGeneration.current) {
        if (Date.now() >= expires) throw new Error("PAIRING_EXPIRED：授权已过期，请重新连接");
        const poll = await client.pollPairing(start.pairingId, start.pollToken);
        if (generation !== pairingGeneration.current) return;
        if (poll.status === "authorized" && poll.accessToken) {
          await native().save_connection(start.pairingId, poll.accessToken);
          await client.events();
          setConnection({ baseUrl, connected: true, pairingId: start.pairingId });
          setEditing(false); setNotice("连接成功，可以选择 Demo 了。"); return;
        }
        if (poll.status === "expired") throw new Error("PAIRING_EXPIRED：授权已过期，请重新连接");
        await delay(1000);
      }
    } catch (error) { report(error); }
    finally { if (generation === pairingGeneration.current) { setPairing(false); setPairingUrl(""); } }
  }
  const patch = (id: string, update: Partial<Task>) => setTasks(rows => rows.map(row => row.id === id ? { ...row, ...update } : row));
  async function run(files: DemoFile[]) {
    if (running.current) return;
    running.current = true; setBusy(true); setProblem(null);
    try {
      for (const file of files) {
        patch(file.id, { error: undefined, phase: "waiting", message: "等待处理" });
        try {
          await uploadDemo({
            hash: () => native().hash_demo(file.id), events: client.events, submit: client.submit,
            exportZip: () => exportZip(file.id, message => patch(file.id, { message })),
            cleanup: async () => { await native().cleanup(file.id); },
            choose: candidates => new Promise(resolve => { resolver.current = resolve; setChoice({ file: file.name, candidates }); }),
            update: update => { patch(file.id, update); void native().record(file.id, update.phase).catch(() => {}); },
          });
        } catch (error) {
          const detail = explainError(error);
          patch(file.id, { phase: "failed", message: detail.message, error: detail });
          await native().record(file.id, "failed", detail.code).catch(() => {});
        }
      }
    } finally { setBusy(false); running.current = false; }
  }
  async function select() {
    try {
      const files = await native().select_demos();
      setTasks(rows => [...rows, ...files.map(file => ({ ...file, phase: "waiting" as const, message: "等待处理" }))]);
      await run(files);
    } catch (error) { report(error); }
  }
  const act = (fn: () => Promise<unknown>) => void fn().catch(report);
  const choose = (candidate: RivalHubMatchCandidate | null) => { resolver.current?.(candidate); resolver.current = null; setChoice(null); };
  const connected = connection.connected && !editing;
  const done = tasks.filter(task => task.phase === "done").length;
  return <div className="app">
    <header><div className="wordmark"><span className="mark">R</span><div>RivalHub <span className="product">DEMO UPLOADER</span></div></div><span className={`connection ${connected ? "online" : ""}`}><i />{connected ? "已连接 RivalHub" : "尚未连接"}</span></header>
    <main>
      <div className="intro"><div><p className="eyebrow">RIVALHUB · 比赛数据上传</p><h1>上传比赛 Demo</h1><p className="lead">选择 Demo，匹配 RivalHub 比赛并提交赛后数据。</p></div><div className="steps"><div className={connected ? "complete" : "current"}><b>{connected ? <Check size={15}/> : "1"}</b><span>连接网站<small>登录并授权</small></span></div><ChevronRight/><div className={connected ? "current" : ""}><b>2</b><span>选择 Demo<small>可多选文件</small></span></div><ChevronRight/><div><b>3</b><span>查看结果<small>查看上传状态</small></span></div></div></div>
      {!ready && <aside className="preview">当前为界面预览。连接网站和选择文件请使用 RivalHub Demo Uploader 桌面程序。</aside>}
      {problem && <aside role="alert" className="error"><AlertCircle size={20}/><div><strong>{problem.message}</strong><p>{problem.action}</p><small>错误代码：{problem.code}</small></div><button className="text-button" onClick={() => setProblem(null)}>收起</button></aside>}
      <section className="connection-panel">
        <div className="section-icon"><Link2 size={22}/></div>
        {connected ? <><div className="connection-copy"><h2>网站已连接</h2><p>{connection.baseUrl}</p></div><button className="secondary" disabled={busy} onClick={() => act(() => native().open_website())}>打开网站 <ExternalLink size={14}/></button><button className="text-button" disabled={busy} onClick={() => { setEditing(true); setNotice(""); }}>更换连接</button></> : <div className="connect-form"><h2>连接 RivalHub</h2><p>点击连接，在浏览器登录并授权。本程序不会保存网站密码。</p><label htmlFor="address">RivalHub 网站地址</label><div className="input-row"><input id="address" type="url" value={address} disabled={pairing} onChange={event => setAddress(event.target.value)} placeholder="https://你的赛事网站"/><button className="primary" disabled={!ready || pairing} onClick={() => void connect()}>{pairing ? <LoaderCircle className="spin" size={17}/> : <Link2 size={17}/>} {pairing ? "等待浏览器授权" : "连接 RivalHub"}</button></div>{notice && <p role="status" className="notice">{notice}</p>}{pairingUrl && <button className="text-button" onClick={() => act(() => native().open_website(pairingUrl))}>重新打开授权页面 <ExternalLink size={13}/></button>}{pairing && <button className="text-button" onClick={() => { pairingGeneration.current++; setPairing(false); setPairingUrl(""); setNotice("已取消，请重新连接。"); }}>取消等待</button>}{editing && !pairing && <button className="text-button" onClick={() => act(async () => { await native().configure(connection.baseUrl); setEditing(false); })}>返回当前连接</button>}</div>}
      </section>
      <section className="upload-panel"><div><h2>选择 Demo 文件</h2><p>选择已录制完成的 <code>.dem</code> 文件。可一次选择多场，程序会逐场解析和上传。</p></div><button className="primary" disabled={!ready || !connected || busy || pairing} onClick={() => void select()}>{busy ? <LoaderCircle size={19} className="spin"/> : <FileUp size={19}/>} {busy ? "正在处理队列" : "选择 Demo"}</button></section>
      <section className="queue"><div className="queue-title"><h2>本次任务 <span>{tasks.length}</span></h2><span>{tasks.length ? `${done} 场已完成` : "还没有选择文件"}</span></div>{!tasks.length ? <div className="empty"><FileUp size={32}/><h3>{connected ? "暂无上传任务" : "请先连接 RivalHub"}</h3><p>请先连接 RivalHub，再选择一份或多份 .dem 文件。存在多个候选比赛时，请从列表中选择对应场次。</p></div> : <table><thead><tr><th>Demo / 对应比赛</th><th>状态</th><th>结果与操作</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td><strong className="filename">{task.name}</strong><p>{task.match ?? "等待识别队伍和地图"}</p><small className="diagnostic">诊断编号 {task.id}</small></td><td><span className={`badge ${task.phase}`}>{labels[task.phase]}</span></td><td><p className="result" role="status">{task.message}</p>{task.error && <p className="action">{task.error.action}</p>}{task.phase === "needs_attention" && <p className="action">数据已送达。请在网站对应赛事核对选手名单、地图与比分，按提示处理；不必反复上传。</p>}{task.target && <small>{task.target.series.teamAName} vs {task.target.series.teamBName} · 第 {task.target.map.order} 图</small>}{task.phase === "failed" && <div className="row-actions">{task.error && (task.error.code.startsWith("HTTP_") || task.error.code.startsWith("TARGET") || task.error.code === "STATUS_UNCONFIRMED") && <button className="text-button" onClick={() => act(() => native().open_website())}>打开 RivalHub <ExternalLink size={12}/></button>}<button className="text-button" disabled={busy || !connected} onClick={() => void run([task])}>重试此项</button></div>}{task.phase === "needs_attention" && <button className="text-button" onClick={() => act(() => native().open_website())}>在 RivalHub 处理 <ExternalLink size={12}/></button>}{task.error && <details><summary>错误详情 · {task.error.code}</summary><pre>{task.error.message}</pre></details>}</td></tr>)}</tbody></table>}</section>
      <footer><p>遇到问题时，按错误提示检查比赛或连接；需要协助时，截图并附上诊断编号和日志。<br/><span>Demo 只在本机解析；临时解析文件在处理结束后删除。</span></p><button className="secondary" disabled={!ready} onClick={() => act(async () => { if (await native().export_logs()) setNotice("日志已导出，可发送给管理员。"); })}><Download size={15}/> 导出诊断日志</button></footer>{notice && connected && <p role="status" className="notice">{notice}</p>}
    </main>
    {choice && <div className="overlay"><section role="dialog" aria-modal="true" aria-labelledby="choice-title" className="dialog"><p className="eyebrow">需要你确认一次</p><h2 id="choice-title">请选择对应的 RivalHub 比赛</h2><p>{choice.file}</p><div className="candidates">{choice.candidates.map(candidate => <button autoFocus={candidate === choice.candidates[0]} key={candidate.map.id} onClick={() => choose(candidate)}><strong>{candidate.series.teamAName} vs {candidate.series.teamBName}</strong><span>{candidate.series.stageKey} · {candidate.map.mapName} · 第 {candidate.map.order} 图 · {candidate.map.scoreA ?? "—"} : {candidate.map.scoreB ?? "—"}</span><small>{candidate.series.completedAt?.slice(0, 10) ?? "日期待确认"} · 比赛编号 {candidate.series.id}</small></button>)}</div><button className="secondary" onClick={() => choose(null)}>跳过此项，继续下一场</button></section></div>}
  </div>;
}
