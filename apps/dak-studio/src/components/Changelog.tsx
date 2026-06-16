/**
 * 轻量 changelog markdown 渲染器。
 *
 * 只处理 CHANGELOG.md 的子集（### 标题、- 列表、**加粗**、`行内代码`）。
 * 不依赖外部 markdown 库，产物受控（内容来自发版 CI 注入或 CHANGELOG.md）。
 */
interface Props {
  markdown: string;
}

export function Changelog({ markdown }: Props) {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  const pushList = () => {
    if (inList) { elements.push(<li key={`ul-end-${elements.length}`} style={{ display: "none" }} />); inList = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) { pushList(); continue; }

    // ### heading
    if (trimmed.startsWith("### ")) {
      pushList();
      elements.push(<h3 key={i}>{renderInline(trimmed.slice(4))}</h3>);
      continue;
    }

    // - list items (also ** : before description)
    if (trimmed.startsWith("- ")) {
      inList = true;
      elements.push(<li key={i}>{renderInline(trimmed.slice(2))}</li>);
      continue;
    }

    // plain text paragraph
    pushList();
    elements.push(<p key={i}>{renderInline(trimmed)}</p>);
  }

  return <div className="stu-changelog">{elements}</div>;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Split by **bold** or `code` — non-overlapping patterns
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const inner = match[0];
    if (inner.startsWith("**") && inner.endsWith("**")) {
      parts.push(<strong key={last}>{inner.slice(2, -2)}</strong>);
    } else if (inner.startsWith("`") && inner.endsWith("`")) {
      parts.push(<code key={last}>{inner.slice(1, -1)}</code>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}
