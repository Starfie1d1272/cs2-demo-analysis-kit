import type { ReactNode } from 'react';

export function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="dak-panel">
      <div className="dak-panel-header">
        <div>
          {eyebrow && <div className="dak-panel-eyebrow">{eyebrow}</div>}
          <h2 className="dak-panel-title">{title}</h2>
        </div>
      </div>
      <div className="dak-panel-body">{children}</div>
    </section>
  );
}
