/** 将用户可控文本转义后再插入 HTML 字符串。 */
export function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

const languageKeywords = {
  java: new Set('abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record'.split(' ')),
  javascript: new Set('as async await break case catch class const continue debugger default delete do else export extends false finally for from function get if implements import in instanceof let new null of package private protected return set static super switch this throw true try typeof undefined var void while with yield'.split(' ')),
  typescript: new Set('as async await break case catch class const continue debugger default delete do else export extends false finally for from function get if implements import in instanceof interface keyof let namespace new null of package private protected public readonly return set static super switch this throw true try typeof type undefined var void while with yield'.split(' ')),
  python: new Set('and as assert async await break case class continue def del elif else except False finally for from global if import in is lambda match None nonlocal not or pass raise return True try while with yield'.split(' ')),
  json: new Set('true false null'.split(' ')),
  sql: new Set('SELECT FROM WHERE AND OR NOT NULL INSERT INTO VALUES UPDATE SET DELETE CREATE ALTER DROP TABLE JOIN LEFT RIGHT INNER OUTER ON AS GROUP BY ORDER HAVING LIMIT OFFSET DISTINCT UNION ALL CASE WHEN THEN ELSE END COUNT SUM AVG MIN MAX ASC DESC'.split(' ')),
  bash: new Set('if then else elif fi for while in do done case esac function select time until'.split(' '))
};

/** 根据代码块语言名称选择高亮关键字集合。 */
function keywordsFor(language) {
  const normalized = language.toLowerCase();
  if (['js', 'jsx', 'mjs', 'cjs'].includes(normalized)) return languageKeywords.javascript;
  if (['ts', 'tsx'].includes(normalized)) return languageKeywords.typescript;
  if (['py', 'python3'].includes(normalized)) return languageKeywords.python;
  if (['yml', 'yaml'].includes(normalized)) return new Set();
  if (['sh', 'shell', 'zsh'].includes(normalized)) return languageKeywords.bash;
  return languageKeywords[normalized] || new Set();
}

/** 判断代码块语言是否使用 SQL 的大小写不敏感关键字。 */
function isSqlLanguage(language) {
  return language.toLowerCase() === 'sql';
}

/** 为单个代码片段生成带类别的安全 HTML。 */
function highlightToken(token, language, nextCharacter) {
  const escaped = escapeHtml(token);
  const keywords = keywordsFor(language);
  if (/^(\/\/|#|--)/.test(token) || /^\/\*/.test(token)) return `<span class="syntax-comment">${escaped}</span>`;
  if (/^("|'|`)/.test(token)) return `<span class="syntax-string">${escaped}</span>`;
  if (/^\d/.test(token)) return `<span class="syntax-number">${escaped}</span>`;
  const keyword = isSqlLanguage(language) ? keywords.has(token.toUpperCase()) : keywords.has(token);
  if (keyword) return `<span class="syntax-keyword">${escaped}</span>`;
  if (/^[A-Z][A-Za-z0-9_$]*$/.test(token)) return `<span class="syntax-type">${escaped}</span>`;
  if (/^\s*\(/.test(nextCharacter)) return `<span class="syntax-function">${escaped}</span>`;
  return escaped;
}

/** 对代码块中的注释、字符串、数字、关键字和函数名做语法高亮。 */
export function highlightCode(value, language = '') {
  if (!language) return escapeHtml(value);
  const tokenPattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
  let output = '';
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(value))) {
    output += escapeHtml(value.slice(cursor, match.index));
    output += highlightToken(match[0], language, value.slice(tokenPattern.lastIndex));
    cursor = tokenPattern.lastIndex;
  }
  return output + escapeHtml(value.slice(cursor));
}

/** 将一行中的 Markdown 内联语法转换为安全 HTML。 */
function renderInlineMarkdown(value) {
  const tokens = [];
  const token = html => {
    // 占位符不能包含下划线或星号，否则会被后续的 Markdown 规则再次解析。
    const key = `@@MDTOKEN${tokens.length}@@`;
    tokens.push(html);
    return key;
  };
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, (_, code) => token(`<code>${code}</code>`));
  html = html.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, url) => {
    const safeUrl = /^(https?:\/\/|mailto:)/i.test(url) ? url : '#';
    return token(`<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  return html.replace(/@@MDTOKEN(\d+)@@/g, (_, index) => tokens[Number(index)]);
}

/** 将 AI 返回的 Markdown 文本转换为聊天气泡可展示的安全 HTML。 */
export function renderMarkdown(value) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [];
  let listType = '';
  let inCode = false;
  let codeLanguage = '';
  let codeLines = [];

  /** 把暂存的普通段落输出为 HTML。 */
  function flushParagraph() {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
    paragraph = [];
  }

  /** 关闭当前正在输出的列表。 */
  function closeList() {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = '';
  }

  /** 关闭代码块并保留其中的原始缩进和换行。 */
  function flushCode() {
    const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
    output.push(`<pre><code${languageClass}>${highlightCode(codeLines.join('\n'), codeLanguage)}</code></pre>`);
    codeLines = [];
    codeLanguage = '';
  }

  for (const line of lines) {
    if (inCode) {
      const closingFence = line.match(/^\s*```\s*$/);
      if (closingFence) {
        flushCode();
        inCode = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    const openingFence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (openingFence) {
      flushParagraph();
      closeList();
      inCode = true;
      codeLanguage = openingFence[1];
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        output.push('<ul>');
        listType = 'ul';
      }
      output.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        output.push('<ol>');
        listType = 'ol';
      }
      output.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      output.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    paragraph.push(line);
  }

  if (inCode) flushCode();
  flushParagraph();
  closeList();
  return output.join('');
}
