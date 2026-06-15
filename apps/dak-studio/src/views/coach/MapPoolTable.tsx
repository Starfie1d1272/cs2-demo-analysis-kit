import { useMemo, useState } from "react";
import { autoName, buildTacticalClusters, type TacticalCluster } from "../../lib/tactics.js";
import type { TacticalRoundFact } from "../../lib/facts.js";
import type { StudioDemoEntry } from "../../lib/library.js";
import { displayTeamName } from "../../lib/identity.js";

export interface MapPoolTableProps {
  clusters: TacticalCluster[];
  facts: TacticalRoundFact[];
  entries: StudioDemoEntry[];
  myTeamName: string | null;
  teamRenames?: Record<string, string>;
}

interface MapRow {
  mapName: string;
  myRounds: number;
  myWins: number;
  oppRounds: number;
  oppWins: number;
  topOppPatterns: string[];
}

function pct(wins: number, total: number): string {
  if (total === 0) return "—";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

export function MapPoolTable({ clusters, facts, entries, myTeamName, teamRenames = {} }: MapPoolTableProps) {
  const [notes, setNotes] = useState<Record<string, string>>({});

  // matchId → { teamAName, teamBName }
  const entryMeta = useMemo(() => {
    const m = new Map<string, { teamAName: string; teamBName: string }>();
    for (const e of entries) {
      const fileName = e.fileName;
      const key = fileName.replace(/\.zip$/, "");
      m.set(key, { teamAName: e.meta.teamAName, teamBName: e.meta.teamBName });
    }
    return m;
  }, [entries]);

  const myNorm = myTeamName ? displayTeamName(myTeamName, teamRenames).toLowerCase() : null;

  function isMyTeam(fact: TacticalRoundFact): boolean {
    if (!myNorm) return false;
    const meta = entryMeta.get(fact.matchId);
    if (!meta) return false;
    const aName = displayTeamName(meta.teamAName, teamRenames).toLowerCase();
    const bName = displayTeamName(meta.teamBName, teamRenames).toLowerCase();
    if (fact.teamKey === "teamA") return aName === myNorm;
    return bName === myNorm;
  }

  const maps = useMemo(() => {
    const mapNames = [...new Set(facts.map((f) => f.mapName))].sort();
    return mapNames.map((mapName): MapRow => {
      const mapFacts = facts.filter((f) => f.mapName === mapName);
      const myFacts = mapFacts.filter(isMyTeam);
      const oppFacts = mapFacts.filter((f) => !isMyTeam(f));

      const oppClusters = buildTacticalClusters(oppFacts).slice(0, 3);
      const topOppPatterns = oppClusters.map((c) => autoName(c));

      return {
        mapName,
        myRounds: myFacts.length,
        myWins: myFacts.filter((f) => f.won).length,
        oppRounds: oppFacts.length,
        oppWins: oppFacts.filter((f) => f.won).length,
        topOppPatterns,
      };
    });
  }, [facts, myNorm, entryMeta]);

  if (maps.length === 0) {
    return <div className="stu-card stu-empty">暂无地图数据，请导入 demo。</div>;
  }

  return (
    <div className="stu-card">
      <h3>地图池比较</h3>
      <table className="stu-mini-table stu-map-pool-table">
        <thead>
          <tr>
            <th>地图</th>
            {myNorm && <th className="stu-num">我方样本</th>}
            {myNorm && <th className="stu-num">我方胜率</th>}
            <th className="stu-num">对手样本</th>
            <th className="stu-num">对手胜率</th>
            <th>对手高频打法</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {maps.map((row) => (
            <tr key={row.mapName}>
              <td>{row.mapName.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase())}</td>
              {myNorm && <td className="stu-num">{row.myRounds || "—"}</td>}
              {myNorm && <td className="stu-num">{pct(row.myWins, row.myRounds)}</td>}
              <td className="stu-num">{row.oppRounds || "—"}</td>
              <td className="stu-num">{pct(row.oppWins, row.oppRounds)}</td>
              <td>
                {row.topOppPatterns.length > 0
                  ? row.topOppPatterns.map((p, i) => <div key={i}>{p}</div>)
                  : "—"}
              </td>
              <td>
                <input
                  className="stu-input stu-input-sm"
                  value={notes[row.mapName] ?? ""}
                  placeholder="备注…"
                  onChange={(e) => setNotes((n) => ({ ...n, [row.mapName]: e.target.value }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
