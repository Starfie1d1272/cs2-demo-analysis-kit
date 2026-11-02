import { useRef } from "react";
import { parseTags } from "../lib/tags";

export function WorkbenchView({ importing, importTagsRaw, onImportFiles, onNativeImport, onMatches }: {
  importing: boolean; importTagsRaw: string; onImportFiles: (files: Iterable<File>, tags: string[]) => void;
  onNativeImport?: () => void; onMatches: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return <div className="stu-view"><header className="stu-view-header"><div><h1>工作台</h1><p>从比赛开始复盘，或继续分析与备战。</p></div></header>
    <div className="stu-header-actions"><button type="button" className="stu-button" onClick={onMatches}>浏览比赛</button>
      {onNativeImport ? <button type="button" className="stu-button" disabled={importing} onClick={onNativeImport}>导入 demo</button> : <><button type="button" className="stu-button" disabled={importing} onClick={() => fileInput.current?.click()}>导入 demo</button><input ref={fileInput} type="file" accept=".zip,.dem" multiple hidden disabled={importing} onChange={e => { if (e.target.files) onImportFiles(e.target.files, parseTags(importTagsRaw)); e.target.value = ""; }} /></>}
    </div></div>;
}
