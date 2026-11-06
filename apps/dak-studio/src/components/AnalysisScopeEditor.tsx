import { useState } from 'react';
import { entryDate, type StudioDemoEntry } from '../lib/demo-entry';
import {
  EMPTY_ANALYSIS_CORPUS,
  filterCorpusEntriesByTeam,
  isCalendarDate,
  resolveAnalysisCorpus,
  type AnalysisContext,
  type AnalysisEventScope,
} from '../lib/analysis-context';
import { displayTeamName, teamRenameGroups } from '../lib/team-identity';

/** 直接编辑页面的 AnalysisContext；所有比赛筛选只由 resolver 执行。 */
export function AnalysisScopeEditor({
  entries,
  context,
  onChange,
  events,
  teamRenames = {},
}: {
  entries: StudioDemoEntry[];
  context: AnalysisContext;
  onChange: (context: AnalysisContext) => void;
  events: AnalysisEventScope[];
  teamRenames?: Record<string, string>;
}) {
  const corpus = context.corpus;
  const [from, setFrom] = useState(corpus.dateRange?.from ?? '');
  const [to, setTo] = useState(corpus.dateRange?.to ?? '');
  const [includeUnknown, setIncludeUnknown] = useState(corpus.dateRange?.includeUnknown ?? false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<typeof corpus>) =>
    onChange({ ...context, corpus: { ...corpus, ...patch } });
  const toggle = (items: string[], value: string) =>
    items.includes(value) ? items.filter((x) => x !== value) : [...items, value];
  const applyDate = () => {
    if (
      (from && !isCalendarDate(from)) ||
      (to && !isCalendarDate(to)) ||
      (from && to && from > to)
    ) {
      setError('请输入有效日期，且开始日期不能晚于结束日期。');
      return;
    }
    setError(null);
    update({
      dateRange: from || to ? { from: from || null, to: to || null, includeUnknown } : undefined,
    });
  };
  const effective = resolveAnalysisCorpus(entries, corpus, events);
  const maps = [...new Set(entries.map((e) => e.meta.mapName))].sort();
  const tags = [...new Set(entries.flatMap((e) => e.tags))].sort();
  const teams = teamRenameGroups(
    entries.map((e) => ({ teamA: e.meta.teamAName, teamB: e.meta.teamBName })),
    teamRenames,
  );

  return (
    <div className="stu-scope">
      <div className="stu-scope-bar">
        <strong>
          比赛范围 · {effective.length}/{entries.length} 场
        </strong>
        <button
          type="button"
          className="stu-button-sm"
          onClick={() => {
            onChange({
              ...context,
              corpus: {
                ...EMPTY_ANALYSIS_CORPUS,
                entryIds: corpus.entryIds,
                entrySelectionActive: corpus.entrySelectionActive || corpus.entryIds.length > 0,
              },
            });
            setFrom('');
            setTo('');
            setIncludeUnknown(false);
            setError(null);
          }}
        >
          重置筛选（保留比赛选择）
        </button>
      </div>
      <div className="stu-chip-row">
        赛事：
        {events.map((e) => (
          <button
            type="button"
            key={e.id}
            aria-pressed={corpus.eventIds.includes(e.id)}
            className={corpus.eventIds.includes(e.id) ? 'stu-chip stu-chip-active' : 'stu-chip'}
            onClick={() => update({ eventIds: toggle(corpus.eventIds, e.id) })}
          >
            {e.name}
          </button>
        ))}
      </div>
      <div className="stu-chip-row">
        地图：
        {maps.map((m) => (
          <button
            type="button"
            key={m}
            aria-pressed={corpus.maps.includes(m)}
            className={corpus.maps.includes(m) ? 'stu-chip stu-chip-active' : 'stu-chip'}
            onClick={() => update({ maps: toggle(corpus.maps, m) })}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="stu-chip-row">
        标签：
        {tags.map((t) => (
          <button
            type="button"
            key={t}
            aria-pressed={corpus.tags.includes(t)}
            className={corpus.tags.includes(t) ? 'stu-chip stu-chip-active' : 'stu-chip'}
            onClick={() => update({ tags: toggle(corpus.tags, t) })}
          >
            #{t}
          </button>
        ))}
      </div>
      <div>
        日期：
        <input
          className="stu-input"
          aria-label="开始日期"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />{' '}
        至{' '}
        <input
          className="stu-input"
          aria-label="结束日期"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />{' '}
        <label>
          <input
            type="checkbox"
            checked={includeUnknown}
            onChange={(e) => setIncludeUnknown(e.target.checked)}
          />
          包含未知日期
        </label>{' '}
        <button type="button" className="stu-button-sm" onClick={applyDate}>
          应用日期
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
      <details>
        <summary>具体比赛与排除项</summary>
        <p>选择具体比赛后只分析所选场次；清除选择解除具体比赛限制，其他筛选与排除项仍生效。</p>
        <button
          type="button"
          className="stu-button-sm"
          onClick={() => update({ entryIds: [], entrySelectionActive: false })}
        >
          清除具体比赛选择
        </button>
        <div className="stu-scope-list">
          {entries.map((entry) => {
            const name = `${entry.meta.mapName} · ${displayTeamName(entry.meta.teamAName, teamRenames)} ${entry.meta.teamAScore}:${entry.meta.teamBScore} ${displayTeamName(entry.meta.teamBName, teamRenames)} · ${entryDate(entry) ?? '未知日期'} · ${entry.fileName}`;
            return (
              <div key={entry.id} className="stu-scope-item">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${name}`}
                    checked={corpus.entryIds.includes(entry.id)}
                    onChange={() =>
                      update({
                        entryIds: toggle(corpus.entryIds, entry.id),
                        entrySelectionActive: true,
                      })
                    }
                  />
                  选择
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`排除 ${name}`}
                    checked={corpus.excludedEntryIds.includes(entry.id)}
                    onChange={() =>
                      update({ excludedEntryIds: toggle(corpus.excludedEntryIds, entry.id) })
                    }
                  />
                  排除
                </label>
                {entry.meta.mapName} · {displayTeamName(entry.meta.teamAName, teamRenames)}{' '}
                {entry.meta.teamAScore}:{entry.meta.teamBScore}{' '}
                {displayTeamName(entry.meta.teamBName, teamRenames)} ·{' '}
                {entryDate(entry) ?? '未知日期'}
              </div>
            );
          })}
        </div>
        {corpus.entryIds
          .filter((id) => !entries.some((entry) => entry.id === id))
          .map((id) => (
            <p key={id}>
              已选择的比赛不可用：{id}{' '}
              <button
                type="button"
                className="stu-button-sm"
                aria-label={`移除不可用比赛 ${id}`}
                onClick={() =>
                  update({
                    entryIds: corpus.entryIds.filter((value) => value !== id),
                    entrySelectionActive: true,
                  })
                }
              >
                移除
              </button>
            </p>
          ))}
      </details>
      <div>当前主题支持的条件：请在对应主题内调整。</div>
      {context.focus.kind === 'team' && (
        <button
          type="button"
          className="stu-button-sm"
          onClick={() => {
            const filtered = filterCorpusEntriesByTeam(
              effective,
              context.focus.kind === 'team' ? context.focus.teamName : '',
              teamRenames,
            );
            update({ entryIds: filtered.map((entry) => entry.id), entrySelectionActive: true });
          }}
        >
          只看这支队伍参加的比赛
        </button>
      )}
      <div className="stu-chip-row">
        对象：
        <button
          type="button"
          aria-pressed={context.focus.kind === 'aggregate'}
          className={context.focus.kind === 'aggregate' ? 'stu-chip stu-chip-active' : 'stu-chip'}
          onClick={() => onChange({ ...context, focus: { kind: 'aggregate' } })}
        >
          总体
        </button>
        {teams.map((team) => (
          <button
            type="button"
            key={team.displayName}
            aria-pressed={
              context.focus.kind === 'team' && context.focus.teamName === team.displayName
            }
            className={
              context.focus.kind === 'team' && context.focus.teamName === team.displayName
                ? 'stu-chip stu-chip-active'
                : 'stu-chip'
            }
            onClick={() =>
              onChange({ ...context, focus: { kind: 'team', teamName: team.displayName } })
            }
          >
            {team.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
