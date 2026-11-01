export interface JsonParseFailureCause {
  name: "SyntaxError" | "TypeError" | "RangeError" | "Error";
  message: string;
}

/** Project parser structure, never the original message, excerpt, token, stack or cause. */
export function jsonParseFailureCause(error: unknown): JsonParseFailureCause {
  let name: JsonParseFailureCause["name"] = "Error";
  let reason = "JSON parsing failed";
  let location = "location unavailable";
  try {
    name = error instanceof SyntaxError ? "SyntaxError" : error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError" : "Error";
    if (name === "SyntaxError") {
      reason = "invalid JSON syntax";
      const message = (error as SyntaxError).message;
      if (typeof message === "string") {
        // These are finite parser categories; the unexpected token itself is payload.
        for (const [prefix, category] of [
          ["Unexpected token", "unexpected token"],
          ["Unexpected end of JSON input", "unexpected end of JSON input"],
          ["Unterminated string", "unterminated string"],
          ["Expected double-quoted property name", "expected quoted property name"],
          ["Unexpected non-whitespace character after JSON", "trailing non-whitespace data"],
        ] as const) if (message.startsWith(prefix)) { reason = category; break; }
        // Only decimal coordinates from recognized terminal engine suffixes survive.
        const position = / at position ([0-9]{1,10})(?: \(line ([0-9]{1,10}) column ([0-9]{1,10})\))?$/.exec(message.slice(-200));
        const line = / at line ([0-9]{1,10}) column ([0-9]{1,10})(?: of the JSON data)?$/.exec(message.slice(-200));
        if (position) location = `position ${Number(position[1])}${position[2] ? `, line ${Number(position[2])}, column ${Number(position[3])}` : ""}`;
        else if (line) location = `line ${Number(line[1])}, column ${Number(line[2])}`;
      }
    }
  } catch { /* Hostile exception properties cannot expose payload or break a downgrade. */ }
  return { name, message: `${name}: ${reason} (${location})` };
}
