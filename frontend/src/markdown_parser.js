// Robust Pure-Markdown Parser supporting:
// - Tables (| Col 1 | Col 2 |)
// - Headings (#, ##, ###, ####)
// - Checklists (- [ ] item, - [x] done)
// - Blockquotes (> quote)
// - Bullet lists (- or *)
// - Numbered lists (1. item)
// - Code blocks (```lang ... ```) & inline code (`code`)
// - Bold (**bold**) & Italics (*italic*)
// - Horizontal rules (---)

export function renderFullMarkdown(md) {
  if (!md) return '';

  const lines = md.split('\n');
  const out = [];
  let inCodeBlock = false;
  let codeBlockLines = [];
  let inTable = false;
  let tableRows = [];
  let inList = false;

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) {
      inTable = false;
      tableRows = [];
      return;
    }

    let html = '<div class="md-table-wrapper"><table class="md-table">';
    // First row is header if next is separator
    let hasHeader = false;
    if (tableRows.length >= 2 && isTableSeparator(tableRows[1])) {
      hasHeader = true;
    }

    if (hasHeader) {
      html += '<thead><tr>';
      const cells = splitTableRow(tableRows[0]);
      cells.forEach(c => {
        html += `<th>${parseInline(c)}</th>`;
      });
      html += '</tr></thead>';

      html += '<tbody>';
      for (let i = 2; i < tableRows.length; i++) {
        html += '<tr>';
        const cells = splitTableRow(tableRows[i]);
        cells.forEach(c => {
          html += `<td>${parseInline(c)}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody>';
    } else {
      html += '<tbody>';
      for (let i = 0; i < tableRows.length; i++) {
        html += '<tr>';
        const cells = splitTableRow(tableRows[i]);
        cells.forEach(c => {
          html += `<td>${parseInline(c)}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody>';
    }

    html += '</table></div>';
    out.push(html);
    inTable = false;
    tableRows = [];
  };

  const flushList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Code block check
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        const code = escapeHtml(codeBlockLines.join('\n'));
        out.push(`<pre class="md-code-block"><code>${code}</code></pre>`);
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        flushTable();
        flushList();
        inCodeBlock = true;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Table row detection
    if (line.startsWith('|') && line.endsWith('|')) {
      flushList();
      inTable = true;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(line)) {
      flushList();
      out.push('<hr class="md-hr" />');
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      flushList();
      out.push(`<h1 class="md-h1">${parseInline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2 class="md-h2">${parseInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      out.push(`<h3 class="md-h3">${parseInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('#### ')) {
      flushList();
      out.push(`<h4 class="md-h4">${parseInline(line.slice(5))}</h4>`);
      continue;
    }

    // Checkboxes
    if (/^-\s*\[([ xX])\]\s+(.*)$/.test(line)) {
      flushList();
      const match = line.match(/^-\s*\[([ xX])\]\s+(.*)$/);
      const isChecked = match[1].toLowerCase() === 'x';
      const text = parseInline(match[2]);
      out.push(`
        <div class="md-checklist-item">
          <input type="checkbox" class="md-checkbox" ${isChecked ? 'checked' : ''} />
          <span class="${isChecked ? 'completed' : ''}">${text}</span>
        </div>
      `);
      continue;
    }

    // Bullet list items
    if (/^[-*]\s+(.*)$/.test(line)) {
      if (!inList) {
        out.push('<ul class="md-list">');
        inList = true;
      }
      const match = line.match(/^[-*]\s+(.*)$/);
      out.push(`<li>${parseInline(match[1])}</li>`);
      continue;
    } else if (inList && !/^\s+/.test(rawLine)) {
      flushList();
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushList();
      out.push(`<blockquote class="md-blockquote">${parseInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Empty line
    if (!line) {
      flushList();
      continue;
    }

    // Regular Paragraph
    out.push(`<p class="md-p">${parseInline(line)}</p>`);
  }

  flushTable();
  flushList();

  return out.join('\n');
}

function isTableSeparator(line) {
  return /^\|[\s-:]+\|[\s|:-]*$/.test(line);
}

function splitTableRow(row) {
  const trimmed = row.slice(1, -1);
  return trimmed.split('|').map(s => s.trim());
}

function parseInline(text) {
  let s = escapeHtml(text);

  // Inline Code
  s = s.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold & Italic
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  return s;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
