import type { StudioPageId } from "../lib/studio-navigation";

const links = [
  ["player", "选手"], ["personal-review", "个人复盘"], ["team", "队伍"], ["patterns", "战术模式与对手侦察"],
  ["event-analysis", "赛事"], ["opening", "开局动线"], ["control", "控图"], ["duel", "交战与配合"],
  ["economy", "经济"], ["utility", "道具"], ["lineups", "点位"],
] as const;
export function AnalysisView({ page, onSelect }: { page: StudioPageId; onSelect: (page: typeof links[number][0]) => void }) {
  return <nav className="stu-subtabs" aria-label="分析分区">{links.map(([key, label]) => <button key={key} type="button" aria-current={page === key ? "page" : undefined} className={page === key ? "stu-subtab stu-subtab-active" : "stu-subtab"} onClick={() => onSelect(key)}>{label}</button>)}</nav>;
}
