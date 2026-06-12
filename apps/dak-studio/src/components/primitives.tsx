import type { ReactNode } from "react";

/**
 * Tactical Slate 公共原语（docs/design-language.md §3/§4）。
 * 所有视图的空态、证据跳转与 ⓘ 口径说明必须经由本文件，禁止视图私有实现。
 */

/** 空态三件套：empty（无数据）/ insufficient（数据不足）/ error（失败）。加载中用 stu-loading。 */
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
    <div className={`stu-empty stu-empty-${variant}`}>
      {mark && <div className="stu-empty-mark">⌖</div>}
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
    <button type="button" className="stu-evidence" disabled={disabled} onClick={onOpen} title={hint}>
      {children}
    </button>
  );
}

/** 派生指标的 ⓘ 口径说明（公式、窗口参数、已知误差）。 */
export function MetricInfo({ note }: { note: ReactNode }) {
  return (
    <span className="stu-info" tabIndex={0} aria-label="口径说明">
      ⓘ<span className="stu-info-tip" role="tooltip">{note}</span>
    </span>
  );
}
