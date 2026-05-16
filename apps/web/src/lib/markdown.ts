/**
 * Minimal markdown renderer for trusted user notes.
 * Supports: headings (#, ##, ###), bold, italic, inline code,
 * bullet lists, numbered lists, and line breaks.
 *
 * Security: strips <script> tags and on* event attributes before returning HTML.
 */

function sanitise(html: string): string {
  // Strip script tags (with content)
  let safe = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip on* event attributes
  safe = safe.replace(/\s+on\w+="[^"]*"/gi, '');
  safe = safe.replace(/\s+on\w+='[^']*'/gi, '');
  safe = safe.replace(/\s+on\w+=\S+/gi, '');
  return safe;
}

export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inUl = false;
  let inOl = false;

  function closeList() {
    if (inUl) {
      output.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      output.push('</ol>');
      inOl = false;
    }
  }

  function inlineFormat(line: string): string {
    return (
      line
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic (single asterisk or underscore, not double)
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
    );
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Headings
    const h3 = /^###\s+(.+)/.exec(line);
    if (h3) {
      closeList();
      output.push(`<h3>${inlineFormat(h3[1] ?? '')}</h3>`);
      continue;
    }

    const h2 = /^##\s+(.+)/.exec(line);
    if (h2) {
      closeList();
      output.push(`<h2>${inlineFormat(h2[1] ?? '')}</h2>`);
      continue;
    }

    const h1 = /^#\s+(.+)/.exec(line);
    if (h1) {
      closeList();
      output.push(`<h1>${inlineFormat(h1[1] ?? '')}</h1>`);
      continue;
    }

    // Unordered list
    const ul = /^[-*]\s+(.+)/.exec(line);
    if (ul) {
      if (inOl) {
        output.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        output.push('<ul>');
        inUl = true;
      }
      output.push(`<li>${inlineFormat(ul[1] ?? '')}</li>`);
      continue;
    }

    // Ordered list
    const ol = /^\d+\.\s+(.+)/.exec(line);
    if (ol) {
      if (inUl) {
        output.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        output.push('<ol>');
        inOl = true;
      }
      output.push(`<li>${inlineFormat(ol[1] ?? '')}</li>`);
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      closeList();
      output.push('<br>');
      continue;
    }

    closeList();
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeList();
  return sanitise(output.join('\n'));
}
