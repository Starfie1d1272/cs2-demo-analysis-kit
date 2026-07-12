import type { ReactNode } from "react";
import type { EvidenceRef } from "@cs2dak/contract";
import type { AnalysisFinding } from "@cs2dak/presentation";

/**
 * 产品中立原语（docs/design-language.md §3/§4）。
 * 所有产品的空态、证据跳转与 ⓘ 口径说明必须经由本文件，禁止各自私有实现。
 */

/** 空态三件套：empty（无数据）/ insufficient（数据不足）/ error（失败）。加载中用 dak-loading。 */
export function EmptyState({
  variant = "empty",
  title,
  hint,
  mark,
  action
}: {
  variant?: "empty" | "insufficient" | "error";
  title: string;
  /** 文案需说明「需要什么才能点亮本页」 */
  hint?: ReactNode;
  /** 仅完整空页用大图标，区块级空态省略 */
  mark?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`dak-empty dak-empty-${variant}`}>
      {mark && <div className="dak-empty-mark">⌖</div>}
      <h2>{title}</h2>
      {hint != null && <p>{hint}</p>}
      {action}
    </div>
  );
}

/** Query-first 证据链接：统计值 → 回合列表 / 2D 回放。hover 显示去向。 */
export function EvidenceLink({
  onOpen,
  disabled,
  hint = "打开该场比赛复盘",
  children
}: {
  onOpen: () => void;
  disabled?: boolean;
  /** hover 提示去向 */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className="dak-evidence" disabled={disabled} onClick={onOpen} title={hint}>
      {children}
    </button>
  );
}

/** 派生指标的 ⓘ 口径说明（公式、窗口参数、已知误差）。 */
export function MetricInfo({ note }: { note?: ReactNode }) {
  if (note == null || note === false || (typeof note === "string" && note.trim().length === 0)) return null;
  return (
    <span className="dak-info" tabIndex={0} aria-label="口径说明">
      ⓘ<span className="dak-info-tip" role="tooltip">{note}</span>
    </span>
  );
}

/** 一行的解释边界；Finding 与 observation 都可复用。 */
export function LimitNote({ children }: { children: ReactNode }) {
  return <p className="dak-limit-note"><b>限制</b>{children}</p>;
}

/** 系统 Finding 的纯展示外壳；证据定位与用户动作由 Studio container 注入。 */
export function FindingPanel({
  id,
  finding,
  onOpenEvidence,
  action,
}: {
  id?: string;
  finding: AnalysisFinding;
  onOpenEvidence?: (evidence: EvidenceRef, finding: AnalysisFinding) => void;
  action?: ReactNode;
}) {
  return (
    <article id={id} className="dak-finding-panel">
      <div className="dak-finding-head">
        <div>
          <small>{finding.capability}</small>
          <h3>{finding.title}</h3>
        </div>
        {action}
      </div>
      <p>{finding.statement}</p>
      <div className="dak-finding-meta">
        <span>{finding.sample.label}{finding.sample.numerator != null ? ` · ${finding.sample.numerator}${finding.sample.denominator != null ? `/${finding.sample.denominator}` : ""}` : ""}</span>
        <span>{finding.baseline ? `参照：${finding.baseline}` : "仅描述性样本"}</span>
      </div>
      {finding.evidence.length > 0 && onOpenEvidence && (
        <button type="button" className="dak-evidence" onClick={() => onOpenEvidence(finding.evidence[0]!, finding)}>
          查看证据 · R{finding.evidence[0]!.roundNumber}
        </button>
      )}
      {finding.limitations[0] && <LimitNote>{finding.limitations[0]}</LimitNote>}
    </article>
  );
}
