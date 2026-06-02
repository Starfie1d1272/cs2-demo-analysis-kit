import type { TimelineEvent } from "@cs2dak/contract";
import { useState } from "react";

export interface RoundTimelineProps {
  events: TimelineEvent[];
  initialLimit?: number;
}

export function RoundTimeline({ events, initialLimit = 120 }: RoundTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? events : events.slice(0, initialLimit);
  const hiddenCount = events.length - visibleEvents.length;

  return (
    <div className="dak-timeline">
      {visibleEvents.map((event) => (
        <div className="dak-timeline-row" key={event.id}>
          <span className="dak-badge">R{event.roundNumber}</span>
          <span className="dak-mono dak-muted">{event.clockLabel}</span>
          <span>{event.label}</span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <button className="dak-timeline-more" type="button" onClick={() => setExpanded(true)}>
          展开剩余 {hiddenCount} 条事件
        </button>
      )}
      {expanded && events.length > initialLimit && (
        <button className="dak-timeline-more" type="button" onClick={() => setExpanded(false)}>
          收起到前 {initialLimit} 条
        </button>
      )}
    </div>
  );
}
