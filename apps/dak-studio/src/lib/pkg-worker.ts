import { loadDemoPackageFromZip } from "@cs2dak/core";

self.onmessage = async (event: MessageEvent<{ id: number; buffer: ArrayBuffer }>) => {
  const { id, buffer } = event.data;
  try {
    const pkg = await loadDemoPackageFromZip(buffer);
    self.postMessage({ id, ok: true, pkg });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
