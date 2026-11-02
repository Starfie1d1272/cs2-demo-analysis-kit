import type { ReactNode } from "react";

/** 选手、队伍和范围总体共享同一表现主题容器。 */
export function OverviewTheme({ children }: { children: ReactNode }) {
  return <div aria-label="表现与趋势">{children}</div>;
}
