import { useEffect } from "react";

/** Report readiness only after the owning view has rendered its loaded or terminal state. */
export function usePageReady(ready: boolean, onPageReady?: (keys: string[]) => void): void {
  useEffect(() => {
    if (ready && onPageReady) onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [ready, onPageReady]);
}
