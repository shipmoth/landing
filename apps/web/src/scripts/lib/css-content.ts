/**
 * A computed `content` value without its alternative text: `"[ " counter(step) " ]" / ""`
 * becomes `"[ " counter(step) " ]"`. The alt text starts at the first `/` outside a string and
 * outside parentheses; a value without one comes back unchanged.
 */
export function withoutAltText(content: string): string {
  let quote = '';
  let depth = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '/' && depth === 0) return content.slice(0, i).trimEnd();
  }
  return content;
}
