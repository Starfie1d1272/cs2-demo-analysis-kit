import type { SeriesVeto } from "@cs2dak/contract";

export function BpView({ veto }: { veto: SeriesVeto }) {
  return (
    <div className="stu-bp-lite">
      <div>
        <span>禁图</span>
        <b>{veto.maps.banned.map((row) => row.mapName).join(" / ") || "—"}</b>
      </div>
      <div>
        <span>选图</span>
        <b>{veto.maps.picked.map((row) => `${row.mapName}${row.teamKey ? `(${row.teamKey})` : ""}`).join(" / ") || "—"}</b>
      </div>
      <div>
        <span>决胜图</span>
        <b>{veto.maps.decider ?? "—"}</b>
      </div>
      <div>
        <span>选边</span>
        <b>{veto.sideChoices.map((row) => `${row.mapName}:${row.side.toUpperCase()}`).join(" / ") || "—"}</b>
      </div>
    </div>
  );
}

