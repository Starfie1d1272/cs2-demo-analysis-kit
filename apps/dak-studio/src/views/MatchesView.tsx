export function MatchesView({ page, onMatches, onEvents }: { page: string; onMatches: () => void; onEvents: () => void }) {
  return <nav className="stu-subtabs" aria-label="比赛分区"><button type="button" className={page === "matches" ? "stu-subtab stu-subtab-active" : "stu-subtab"} onClick={onMatches}>比赛库</button><button type="button" className={page === "events" ? "stu-subtab stu-subtab-active" : "stu-subtab"} onClick={onEvents}>赛事</button></nav>;
}
