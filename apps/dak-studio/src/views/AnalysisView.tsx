import { useState } from "react";
import type { ReactNode } from "react";
import type { AnalysisFocus } from "../lib/analysis-context";
import type { AnalysisPageId } from "../lib/studio-navigation";

export type AnalysisTheme = "overview" | "engagement" | "economy" | "utility" | "opening" | "roles";
const themes: { key: AnalysisTheme; label: string; pages: AnalysisPageId[] }[] = [
  { key: "overview", label: "表现与趋势", pages: ["analysis", "event-analysis", "player", "team"] },
  { key: "engagement", label: "交火与协同", pages: ["duel"] },
  { key: "economy", label: "经济与转化", pages: ["economy"] },
  { key: "utility", label: "道具", pages: ["utility", "lineups"] },
  { key: "opening", label: "开局与控图", pages: ["opening", "control"] },
  { key: "roles", label: "位置与职责", pages: ["roles"] },
];
const shortcuts: Record<AnalysisTheme, [AnalysisPageId, string][]> = {
  overview: [["analysis", "总体"], ["player", "选手"], ["team", "队伍"], ["event-analysis", "赛事"]],
  engagement: [["duel", "交战与配合"]], economy: [["economy", "经济"]], utility: [["utility", "道具分析"], ["lineups", "点位"]], opening: [["opening", "个人开局"], ["control", "覆盖场"]], roles: [["roles", "位置与职责"]],
};
export function AnalysisView({ page, focus, onSelect, onSave, onBeginSave, savedPanel, children }: { page: AnalysisPageId; focus: AnalysisFocus; onSelect: (page: AnalysisPageId) => void; onSave: (title: string, shortcut: boolean, copy: boolean) => Promise<void>; onBeginSave: () => Promise<{ title: string; shortcut: boolean } | null>; savedPanel: ReactNode; children: ReactNode }) {
  const [showSaved,setShowSaved] = useState(false), [saving,setSaving] = useState(false), [title,setTitle] = useState(""), [shortcut,setShortcut] = useState(false), [error,setError] = useState("");
  const defaultTitle = `${focus.kind === "aggregate" ? "整体范围" : focus.kind === "team" ? focus.teamName : focus.label} · ${page}`;
  const save = async (copy: boolean) => { try { await onSave(title,shortcut,copy); setSaving(false); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } };
  const theme = page === "patterns" ? "overview" : themes.find(item => item.pages.includes(page))?.key ?? "overview";
  const selectTheme = (key: AnalysisTheme) => onSelect(key === "overview" ? (focus.kind === "player" || focus.kind === "self" ? "player" : focus.kind === "team" ? "team" : focus.kind === "event" ? "event-analysis" : "analysis") : themes.find(item => item.key === key)!.pages[0]);
  return <><div className="stu-header-actions"><button className="stu-button" onClick={() => { setSaving(true); setTitle(defaultTitle); setShortcut(false); setError(""); void onBeginSave().then(value => { if (value) { setTitle(value.title); setShortcut(value.shortcut); } }).catch(e => setError(e instanceof Error ? e.message : "读取失败")); }}>保存分析</button><button className="stu-button" onClick={() => setShowSaved(!showSaved)}>已保存</button></div>{saving && <section className="stu-card"><label>标题 <input value={title} onChange={e => setTitle(e.target.value)} /></label><label><input type="checkbox" checked={shortcut} onChange={e => setShortcut(e.target.checked)} />放到工作台</label>{error && <p role="alert">{error}</p>}<button className="stu-button" onClick={() => void save(false)}>保存</button><button className="stu-button" onClick={() => void save(true)}>另存为</button><button className="stu-button" onClick={() => setSaving(false)}>取消</button></section>}{showSaved && savedPanel}<nav className="stu-subtabs" aria-label="分析主题">{themes.map(item => <button key={item.key} type="button" aria-current={theme === item.key ? "page" : undefined} className={theme === item.key ? "stu-subtab stu-subtab-active" : "stu-subtab"} onClick={() => selectTheme(item.key)}>{item.label}</button>)}</nav><nav className="stu-chip-row" aria-label="主题快捷入口">{shortcuts[theme].map(([target, label]) => <button key={target} type="button" className={page === target ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => onSelect(target)}>{label}</button>)}</nav>{theme === "opening" && <button type="button" className="stu-button-sm" onClick={() => onSelect("patterns")}>战术模式与对手侦察</button>}<p className="stu-muted">阵营、经济档等局部条件只应用于设置它们的主题，切换主题时不应用于其他汇总。</p>{children}</>;
}
