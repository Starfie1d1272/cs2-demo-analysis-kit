/** 把用户输入解析成标签数组：中英文逗号/分号分隔，去空白。 */
export function parseTags(raw: string): string[] {
  return raw
    .split(/[,，;；]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
