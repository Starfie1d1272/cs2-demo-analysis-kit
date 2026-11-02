import { useEffect, useState } from "react";
import { listPracticeLineups, type PracticeLineup } from "../lib/practice-lineups";

export function MaterialsView({ onLineups, onOpenMatch }: { onLineups: () => void; onOpenMatch: (id: string, target: { roundNumber: number; tick?: number }) => void }) {
  const [items, setItems] = useState<PracticeLineup[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; void listPracticeLineups().then(rows => { if (!cancelled) setItems(rows); }).catch(reason => { if (!cancelled) setError(String(reason)); }); return () => { cancelled = true; }; }, []);
  return <div className="stu-view"><header className="stu-view-header"><div><h1>战术与训练</h1><p>整理备战材料并访问已保存的练习。</p></div></header>
    <button type="button" className="stu-button" onClick={onLineups}>浏览道具点位</button><h2>已保存练习</h2>
    {error ? <p role="alert">读取练习失败：{error}</p> : items.length === 0 ? <p>暂无已保存练习。</p> : items.map(item => <div key={item.id}><b>{item.label}</b> {item.practiceCommand && <code>{item.practiceCommand}</code>} {item.evidence && <button type="button" className="stu-button-sm" onClick={() => onOpenMatch(item.evidence!.entryId, item.evidence!)}>查看比赛</button>}</div>)}
  </div>;
}
