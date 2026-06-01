import type { TimelineEvent } from "@cs2dak/contract";

export interface RoundTimelineProps {
  events: TimelineEvent[];
}

export function RoundTimeline({ events }: RoundTimelineProps) {
  const visibleEvents = events.slice(0, 120);

  return (
    <div className="dak-timeline">
      {visibleEvents.map((event) => (
        <div className="dak-timeline-row" key={event.id}>
          <span className="dak-badge">R{event.roundNumber}</span>
          <span className="dak-mono dak-muted">{event.timeSeconds.toFixed(1)}s</span>
          <span>{event.label}</span>
        </div>
      ))}
      {events.length > visibleEvents.length && (
        <div className="dak-timeline-more">已显示前 {visibleEvents.length} 条，共 {events.length} 条事件</div>
      )}
    </div>
  );
}
