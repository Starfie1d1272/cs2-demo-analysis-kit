import { useEffect, useState } from "react";
import type { CoachMatchSheetDraft } from "../../lib/coach-match-sheet";
import type { SheetMaterialRef } from "../../lib/material-ref";
import type { StudioDemoEntry } from "../../lib/demo-entry";
import { matchIdForEntry } from "../../lib/demo-entry";
import {
  getCoachPlaybook,
  type CoachPlaybookItem,
} from "../../lib/coach-playbook";
import { getCoachAssignment } from "../../lib/coach-assignments";
import { getStudyNote } from "../../lib/study-notes";
import { listTrainingFocus } from "../../lib/training-focus";
import { listPrepItems, prepItemsToMarkdown } from "../../lib/prep-items";
import { listPracticeLineups } from "../../lib/practice-lineups";
import { MapAnnotationCanvas } from "@cs2dak/react";
import { usePlaybookMap } from "./PlaybookPhaseEditor";
import { PlaybookLectureView } from "./PlaybookLectureView";
import type {
  PlaybookLectureState,
  LecturePageState,
} from "../../lib/material-page-state";

type Line = { text: string; markdown: string };
type Resolved = { title: string; lines: Line[]; play?: CoachPlaybookItem };
const escapeText = (s: string) => s.replace(/[\\`*_{}\[\]<>|#]/g, "\\$&");
const safeBody = (s: string) =>
  s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
const label = (text: string): Line => ({ text, markdown: escapeText(text) });
const body = (text: string): Line => ({ text, markdown: safeBody(text) });
const namedBody = (name: string, text: string): Line => ({
  text: `${name}：${text}`,
  markdown: `${escapeText(name)}：${safeBody(text)}`,
});
const safeName = (name: string) => name.split(/[\\/]/).pop() || "来源不可用";
const source = (name: string, map: string, round: number, tick?: number) =>
  label(
    `来源：${safeName(name)} · ${map} · R${round}${tick == null ? "" : ` · tick ${tick}`}`,
  );
async function resolve(
  ref: SheetMaterialRef,
  entries: StudioDemoEntry[],
): Promise<Resolved | null> {
  switch (ref.kind) {
    case "playbook": {
      const n = await getCoachPlaybook(ref.id);
      return (
        n && {
          title: n.title,
          lines: [
            label(`${n.kind} · ${n.mapName} · ${n.side}`),
            namedBody("目的", n.purpose),
            namedBody("触发", n.trigger),
            body(n.body),
            ...n.phases.flatMap((p) => [
              label(`阶段：${p.title}`),
              body(p.body),
              ...p.tasks.map((t) => ({
                text: `${t.playerLabel}：${t.instruction}`,
                markdown: `${escapeText(t.playerLabel)}：${safeBody(t.instruction)}`,
              })),
            ]),
            ...n.evidence.map((e) =>
              source(
                e.source.fileName,
                e.source.mapName,
                e.evidence.roundNumber,
                e.evidence.tick,
              ),
            ),
          ],
          play: n,
        }
      );
    }
    case "assignment-set": {
      const n = await getCoachAssignment(ref.id);
      return (
        n && {
          title: n.title,
          lines: [
            label(`${n.teamLabel} · ${n.mapName} · ${n.side}`),
            ...n.rows.flatMap((r) => [
              label(`${r.playerLabel} · ${r.positionLabel}`),
              namedBody("职责", r.responsibility),
              namedBody("备注", r.notes),
            ]),
          ],
        }
      );
    }
    case "study-note": {
      const n = await getStudyNote(ref.id);
      return (
        n && {
          title: n.title,
          lines: [
            body(n.body),
            ...n.evidence.map((e) =>
              source(
                e.source.fileName,
                e.source.mapName,
                e.evidence.roundNumber,
                e.evidence.tick,
              ),
            ),
          ],
        }
      );
    }
    case "training-focus": {
      const n = (await listTrainingFocus()).find((x) => x.id === ref.id);
      return n
        ? {
            title: n.finding.title,
            lines: [
              label(n.finding.statement),
              label(`依据：${n.finding.basis.join("；")}`),
              label(`局限：${n.finding.limitations.join("；")}`),
              namedBody("用户备注", n.note),
              namedBody("复查条件", n.reviewCondition),
              ...n.evidence.map((e) => {
                const matches = entries.filter(
                  (x) => matchIdForEntry(x) === e.matchId,
                );
                return source(
                  matches.length === 1 ? matches[0].fileName : "来源不可用",
                  matches.length === 1 ? matches[0].meta.mapName : "地图未知",
                  e.roundNumber,
                  e.tick,
                );
              }),
            ],
          }
        : null;
    }
    case "prep-item": {
      const n = (await listPrepItems()).find((x) => x.id === ref.id);
      if (!n) return null;
      const matches = entries.filter((x) => matchIdForEntry(x) === n.matchId);
      const file =
        matches.length === 1 ? safeName(matches[0].fileName) : "来源不可用";
      const safeItem = {
        ...n,
        group: escapeText(n.group),
        mapName: n.mapName ? escapeText(n.mapName) : undefined,
        matchId: escapeText(file),
        note: "",
      };
      const markdown = prepItemsToMarkdown(escapeText(n.group), [safeItem]);
      const display = prepItemsToMarkdown(n.group, [
        { ...n, matchId: file, note: "" },
      ]);
      return {
        title: n.group,
        lines: [
          { text: display, markdown },
          namedBody("用户备注", n.note),
          source(file, n.mapName ?? "地图未知", n.roundNumber),
        ],
      };
    }
    case "practice-lineup": {
      const n = (await listPracticeLineups()).find((x) => x.id === ref.id);
      return n
        ? {
            title: n.label,
            lines: [
              label(`练习命令：${n.practiceCommand ?? "—"}`),
              label("数据不足时无精确投法"),
              ...(n.evidence
                ? [
                    source(
                      entries.find((x) => x.id === n.evidence?.entryId)
                        ?.fileName ?? "来源不可用",
                      n.mapName,
                      n.evidence.roundNumber,
                      n.evidence.tick,
                    ),
                  ]
                : []),
            ],
          }
        : null;
    }
  }
}
function PrintPhase({
  play,
  phase,
}: {
  play: CoachPlaybookItem;
  phase: CoachPlaybookItem["phases"][number];
}) {
  const map = usePlaybookMap(play.mapName);
  return (
    <div className="match-sheet-print-phase">
      <h4>{phase.title}</h4>
      <MapAnnotationCanvas
        map={map}
        level="upper"
        markers={phase.markers}
        selectedMarkerId={null}
      />
      {map.lowerRadarImageUrl &&
        phase.markers.some((marker) => marker.level === "lower") && (
          <>
            <h4>{phase.title} · 下层</h4>
            <MapAnnotationCanvas
              map={map}
              level="lower"
              markers={phase.markers}
              selectedMarkerId={null}
            />
          </>
        )}
    </div>
  );
}
export function MatchSheetView({
  draft,
  entries,
  state,
  onChange,
  onBack,
  onLecture,
}: {
  draft: CoachMatchSheetDraft;
  entries: StudioDemoEntry[];
  state?: Extract<LecturePageState, { kind: "match-sheet" }>;
  onChange?: (
    state: Extract<LecturePageState, { kind: "match-sheet" }>,
  ) => void;
  onBack?: () => void;
  onLecture?: () => void;
}) {
  const [items, setItems] = useState<Record<string, Resolved | null>>({});
  const [loading, setLoading] = useState(true);
  const lecture = !!state;
  const index = state?.lectureIndex ?? 0;
  const playState = state?.playbook ?? null;
  const pages = draft.sections.flatMap<{
    section: CoachMatchSheetDraft["sections"][number];
    ref: SheetMaterialRef | null;
    key: string;
  }>((s) =>
    s.refs.length
      ? s.refs.map((ref) => ({
          section: s,
          ref,
          key: `${s.id}:${ref.kind}:${ref.id}`,
        }))
      : [{ section: s, ref: null, key: `${s.id}:text` }],
  );
  useEffect(() => {
    let live = true;
    setLoading(true);
    void Promise.all(
      pages
        .filter((p) => p.ref)
        .map(async (p) => {
          try {
            return [p.key, await resolve(p.ref!, entries)] as const;
          } catch (e) {
            return [
              p.key,
              {
                title: `${p.ref!.kind}:${p.ref!.id}`,
                lines: [label(`读取失败：${String(e)}`)],
              },
            ] as const;
          }
        }),
    ).then((values) => {
      if (live) {
        setItems(Object.fromEntries(values));
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [draft.sections, entries]);
  const text = () =>
    [
      `# ${escapeText(draft.title)}`,
      `导出时间：${new Date().toLocaleString()}`,
      `对手：${escapeText(draft.opponentLabel)} · 地图：${escapeText(draft.mapName ?? "多图")}`,
      "使用当前材料；此文件是导出当刻的结果。",
      ...draft.sections.flatMap((s) => [
        `\n## ${escapeText(s.heading)}`,
        safeBody(s.notes),
        ...s.refs.flatMap((ref) => {
          const n = items[`${s.id}:${ref.kind}:${ref.id}`];
          return [
            `\n### ${escapeText(n?.title ?? `材料已删除 ${ref.kind}:${ref.id}`)}`,
            ...(n?.lines ?? []).map((line) => line.markdown),
          ];
        }),
      ]),
    ].join("\n\n");
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([text()], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.title.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "match-sheet"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const page = pages[Math.min(index, pages.length - 1)];
  const item = page && items[page.key];
  return (
    <div className="match-sheet-output">
      <div className="match-sheet-actions">
        <button
          className="stu-button-sm"
          onClick={() => (lecture ? onBack?.() : onLecture?.())}
        >
          {lecture ? "结束讲解" : "开始讲解"}
        </button>
        <button className="stu-button-sm" disabled={loading} onClick={download}>
          导出 Markdown
        </button>
        <button
          className="stu-button-sm"
          disabled={loading || lecture}
          onClick={() => window.print()}
        >
          打印
        </button>
        <button
          className="stu-button-sm"
          disabled={loading}
          onClick={() => void navigator.clipboard.writeText(text())}
        >
          复制 Markdown
        </button>
        <p>如桌面打印不可用，请导出 Markdown 后打印。</p>
      </div>
      {lecture ? (
        <section>
          <h2>
            {draft.title} · {draft.opponentLabel} · {draft.mapName ?? "多图"}
          </h2>
          {page && (
            <>
              <h3>{page.section.heading}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{page.section.notes}</p>
              {page.ref &&
                (item ? (
                  <>
                    <h3>{item.title}</h3>
                    {item.lines.map((line, i) => (
                      <p key={i} style={{ whiteSpace: "pre-wrap" }}>
                        {line.text}
                      </p>
                    ))}
                    {item.play && (
                      <PlaybookLectureView
                        key={page.key}
                        draft={item.play}
                        entries={entries}
                        state={
                          playState && playState.id === page.key
                            ? playState
                            : {
                                kind: "playbook",
                                id: page.key,
                                phaseId: null,
                                tab: "diagram",
                                selectedEvidenceId: null,
                                replayEntryId: null,
                                replay: null,
                              }
                        }
                        onChange={(playbook: PlaybookLectureState) =>
                          state && onChange?.({ ...state, playbook })
                        }
                        onBack={() => onBack?.()}
                      />
                    )}
                  </>
                ) : (
                  <p>
                    {loading
                      ? "正在读取材料…"
                      : `材料已删除 ${page.ref.kind}:${page.ref.id}`}
                  </p>
                ))}
            </>
          )}
          <button
            className="stu-button-sm"
            disabled={index <= 0}
            onClick={() => {
              const next = pages[index - 1];
              if (state && next)
                onChange?.({
                  ...state,
                  lectureIndex: index - 1,
                  selectedSectionId: next.section.id,
                  selectedRefKey: next.key,
                  playbook: null,
                });
            }}
          >
            上一项
          </button>
          <button
            className="stu-button-sm"
            disabled={index >= pages.length - 1}
            onClick={() => {
              const next = pages[index + 1];
              if (state && next)
                onChange?.({
                  ...state,
                  lectureIndex: index + 1,
                  selectedSectionId: next.section.id,
                  selectedRefKey: next.key,
                  playbook: null,
                });
            }}
          >
            下一项
          </button>
        </section>
      ) : (
        <article>
          <h1>{draft.title}</h1>
          <p>
            对手：{draft.opponentLabel || "—"} · 地图：{draft.mapName ?? "多图"}
          </p>
          <p>使用当前材料；导出为当刻结果。</p>
          {draft.sections.map((s) => (
            <section key={s.id}>
              <h2>{s.heading}</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{s.notes}</p>
              {s.refs.map((ref) => {
                const n = items[`${s.id}:${ref.kind}:${ref.id}`];
                return (
                  <div key={`${ref.kind}:${ref.id}`}>
                    <h3>{n?.title ?? `材料已删除 ${ref.kind}:${ref.id}`}</h3>
                    {n?.lines.map((line, i) => (
                      <p key={i} style={{ whiteSpace: "pre-wrap" }}>
                        {line.text}
                      </p>
                    ))}
                    {n?.play?.phases.map((phase) => (
                      <PrintPhase key={phase.id} play={n.play!} phase={phase} />
                    ))}
                  </div>
                );
              })}
            </section>
          ))}
        </article>
      )}
    </div>
  );
}
