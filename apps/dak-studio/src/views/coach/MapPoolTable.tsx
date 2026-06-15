import { useEffect, useMemo, useState } from "react";
import { autoName, buildTacticalClusters, type TacticalCluster } from "../../lib/tactics.js";
import type { TacticalRoundFact } from "../../lib/facts.js";
import type { StudioDemoEntry } from "../../lib/library.js";
import { displayTeamName } from "../../lib/identity.js";
import { listMapPoolNotes, saveMapPoolNote } from "../../lib/series.js";

export interface MapPoolTableProps {
  clusters: TacticalCluster[];
  facts: TacticalRoundFact[];
  entries: StudioDemoEntry[];
  myTeamName: string | null;
  opponentTeamName: string | null;
  teamRenames?: Record<string, string>;
}

interface MapRow {
  mapName: string;
  myMatches: number;
  myRounds: number;
  myWins: number;
  oppMatches: number;
  oppRounds: number;
  oppWins: number;
  topOppPatterns: string[];
}

function pct(wins: number, total: number): string {
  if (total === 0) return "—";
  return `${((wins / total) * 100).toFixed(1)}%`;
}

function norm(name: string | null | undefined, teamRenames: Record<string, string>): string {
  return displayTeamName(name ?? "", teamRenames).trim().toLowerCase();
}

function matchCount(rows: TacticalRoundFact[]): number {
  return new Set(rows.map((row) => row.matchId)).size;
}

export function MapPoolTable({ facts, myTeamName, opponentTeamName, teamRenames = {} }: MapPoolTableProps) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const myNorm = myTeamName ? norm(myTeamName, teamRenames) : null;
  const oppNorm = opponentTeamName ? norm(opponentTeamName, teamRenames) : null;

  useEffect(() => {
    void listMapPoolNotes().then(setNotes);
  }, []);

  const maps = useMemo(() => {
    const mapNames = [...new Set(facts.map((f) => f.mapName))].sort();
    return mapNames.map((mapName): MapRow => {
      const mapFacts = facts.filter((f) => f.mapName === mapName);
      const myFacts = myNorm
        ? mapFacts.filter((f) => norm(f.teamName, teamRenames) === myNorm && (!oppNorm || norm(f.opponentName, teamRenames) === oppNorm))
        : [];
      const oppFacts = oppNorm
        ? mapFacts.filter((f) => norm(f.teamName, teamRenames) === oppNorm && (!myNorm || norm(f.opponentName, teamRenames) === myNorm))
        : [];

      const oppClusters = buildTacticalClusters(oppFacts).slice(0, 3);
      const topOppPatterns = oppClusters.map((c) => autoName(c));

      return {
        mapName,
        myMatches: matchCount(myFacts),
        myRounds: myFacts.length,
        myWins: myFacts.filter((f) => f.won).length,
        oppMatches: matchCount(oppFacts),
        oppRounds: oppFacts.length,
        oppWins: oppFacts.filter((f) => f.won).length,
        topOppPatterns,
      };
    });
  }, [facts, myNorm, oppNorm, teamRenames]);

  if (!oppNorm) {
    return <div className="stu-card stu-empty">请先选择指定对手，地图池不会把所有非我方队伍混算为对手。</div>;
  }

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
            {myNorm && <th className="stu-num">我方场次</th>}
            {myNorm && <th className="stu-num">我方回合</th>}
            {myNorm && <th className="stu-num">我方胜率</th>}
            <th className="stu-num">对手场次</th>
            <th className="stu-num">对手回合</th>
            <th className="stu-num">对手胜率</th>
            <th>对手高频打法</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {maps.map((row) => (
            <tr key={row.mapName}>
              <td>{row.mapName.replace(/^de_/, "").replace(/^\w/, (c) => c.toUpperCase())}</td>
              {myNorm && <td className="stu-num">{row.myMatches || "—"}</td>}
              {myNorm && <td className="stu-num">{row.myRounds || "—"}</td>}
              {myNorm && <td className="stu-num">{pct(row.myWins, row.myRounds)}</td>}
              <td className="stu-num">{row.oppMatches || "—"}</td>
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
                  onChange={(e) => {
                    const note = e.target.value;
                    setNotes((n) => ({ ...n, [row.mapName]: note }));
                    void saveMapPoolNote(row.mapName, note);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
