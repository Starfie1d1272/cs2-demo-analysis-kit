import { OverviewTheme } from "./analysis/OverviewTheme";
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
  { key: "roles", label: "位置与职责", pages: ["patterns"] },
];
const shortcuts: Record<AnalysisTheme, [AnalysisPageId, string][]> = {
  overview: [["analysis", "总体"], ["player", "选手"], ["team", "队伍"], ["event-analysis", "赛事"]],
  engagement: [["duel", "交战与配合"]], economy: [["economy", "经济"]], utility: [["utility", "道具分析"], ["lineups", "点位"]], opening: [["opening", "开局动线"], ["control", "控图"]], roles: [["patterns", "模式与对手"]],
};
export function AnalysisView({ page, focus, onSelect, children }: { page: AnalysisPageId; focus: AnalysisFocus; onSelect: (page: AnalysisPageId) => void; children: ReactNode }) {
  const theme = themes.find(item => item.pages.includes(page))?.key ?? "overview";
  const selectTheme = (key: AnalysisTheme) => onSelect(key === "overview" ? (focus.kind === "player" || focus.kind === "self" ? "player" : focus.kind === "team" ? "team" : focus.kind === "event" ? "event-analysis" : "analysis") : themes.find(item => item.key === key)!.pages[0]);
  return <><nav className="stu-subtabs" aria-label="分析主题">{themes.map(item => <button key={item.key} type="button" aria-current={theme === item.key ? "page" : undefined} className={theme === item.key ? "stu-subtab stu-subtab-active" : "stu-subtab"} onClick={() => selectTheme(item.key)}>{item.label}</button>)}</nav><nav className="stu-chip-row" aria-label="主题快捷入口">{shortcuts[theme].map(([target, label]) => <button key={target} type="button" className={page === target ? "stu-chip stu-chip-active" : "stu-chip"} onClick={() => onSelect(target)}>{label}</button>)}</nav>{theme === "overview" ? <OverviewTheme>{children}</OverviewTheme> : children}</>;
}
