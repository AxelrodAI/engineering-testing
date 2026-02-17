/**
 * tokenizer.js — JavaScript source tokenizer using a state machine.
 *
 * Produces tokens of types:
 *   keyword | identifier | number | string | template | regex | operator | punctuation | comment | whitespace
 *
 * Handles: template literals, regex literals, multi-line strings, nested /* comments *\/
 */

const KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false',
  'finally', 'for', 'from', 'function', 'get', 'if', 'import', 'in',
  'instanceof', 'let', 'new', 'null', 'of', 'return', 'set', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined',
  'var', 'void', 'while', 'with', 'yield', 'async', 'await',
]);

// Operators sorted longest first so we always match greedily
const OPERATORS = [
  '>>>=', '**=', '&&=', '||=', '??=', '...', '===', '!==', '>>>',
  '<<=', '>>=', '<=', '>=', '==', '!=', '&&', '||', '??', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>', '=>', '?.', '&=',
  '|=', '^=', '~', '!', '+', '-', '*', '/', '%', '&', '|', '^',
  '<', '>', '=', '?', ':',
];

const PUNCTUATION = new Set(['{', '}', '(', ')', '[', ']', ';', ',', '.']);

/**
 * Returns true if a `/` at this position starts a regex literal rather than division.
 * Regex can appear after: start-of-file, operator, keyword, punctuation (except )/]/})
 */
function isRegexContext(lastSignificant) {
  if (!lastSignificant) return true;
  const { type, value } = lastSignificant;

  // After a value-like token, `/` is division
  if (type === 'number' || type === 'string' || type === 'template' || type === 'regex') return false;
  if (type === 'identifier') return false; // x / y
  if (type === 'keyword' && (value === 'this' || value === 'true' || value === 'false' || value === 'null' || value === 'undefined')) return false;
  if (type === 'punctuation' && (value === ')' || value === ']' || value === '}')) return false;

  return true; // operator, other keyword, open punctuation
}

/**
 * Tokenize a JavaScript source string.
 * @param {string} source - The JavaScript source code.
 * @returns {Array<{type: string, value: string, line: number, col: number}>}
 */
export function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let lastSignificant = null; // last non-whitespace, non-comment token

  function advance(n = 1) {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  }

  function addToken(type, value, tLine, tCol) {
    const tok = { type, value, line: tLine, col: tCol };
    tokens.push(tok);
    if (type !== 'comment' && type !== 'whitespace') {
      lastSignificant = tok;
    }
    return tok;
  }

  while (i < source.length) {
    const tLine = line;
    const tCol = col;
    const ch = source[i];

    // ── Whitespace ─────────────────────────────────────────────
    if (/[ \t\r\f\v]/.test(ch)) {
      let s = '';
      while (i < source.length && /[ \t\r\f\v]/.test(source[i])) { s += source[i]; col++; i++; }
      // Don't emit whitespace tokens — they're noise for analysis
      continue;
    }

    if (ch === '\n') {
      line++; col = 1; i++;
      continue;
    }

    // ── Single-line comment ────────────────────────────────────
    if (ch === '/' && source[i + 1] === '/') {
      let s = '';
      while (i < source.length && source[i] !== '\n') { s += source[i]; col++; i++; }
      addToken('comment', s, tLine, tCol);
      continue;
    }

    // ── Multi-line comment ─────────────────────────────────────
    if (ch === '/' && source[i + 1] === '*') {
      let s = '/*';
      i += 2; col += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') { line++; col = 1; s += '\n'; } else { s += source[i]; col++; }
        i++;
      }
      if (i < source.length) { s += '*/'; col += 2; i += 2; }
      addToken('comment', s, tLine, tCol);
      continue;
    }

    // ── Template literal ───────────────────────────────────────
    if (ch === '`') {
      let s = '`';
      i++; col++;
      let depth = 0; // depth of ${...} nesting inside the template
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          s += c + (source[i + 1] || '');
          const next = source[i + 1];
          if (next === '\n') { line++; col = 1; } else { col += 2; }
          i += 2;
          continue;
        }
        if (c === '$' && source[i + 1] === '{') {
          s += '${'; depth++; col += 2; i += 2;
          continue;
        }
        if (c === '{' && depth > 0) { depth++; s += c; col++; i++; continue; }
        if (c === '}' && depth > 0) { depth--; s += c; col++; i++; continue; }
        if (c === '`' && depth === 0) { s += '`'; col++; i++; break; }
        if (c === '\n') { line++; col = 1; s += c; i++; } else { s += c; col++; i++; }
      }
      addToken('template', s, tLine, tCol);
      continue;
    }

    // ── String literal ─────────────────────────────────────────
    if (ch === '"' || ch === "'") {
      const q = ch;
      let s = q;
      i++; col++;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          const next = source[i + 1] || '';
          s += c + next;
          if (next === '\n') { line++; col = 1; } else { col += 2; }
          i += 2;
          continue;
        }
        if (c === q) { s += c; col++; i++; break; }
        if (c === '\n') { s += c; line++; col = 1; i++; break; } // unterminated
        s += c; col++; i++;
      }
      addToken('string', s, tLine, tCol);
      continue;
    }

    // ── Number literal ─────────────────────────────────────────
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] || ''))) {
      let s = '';
      if (ch === '0' && /[xXbBoO]/.test(source[i + 1] || '')) {
        // Hex / binary / octal prefix
        s += source[i] + source[i + 1]; col += 2; i += 2;
        const hexDigits = ch === '0' && (source[i - 1] === 'x' || source[i - 1] === 'X')
          ? /[0-9a-fA-F_]/
          : ch === '0' && (source[i - 1] === 'b' || source[i - 1] === 'B')
            ? /[01_]/
            : /[0-7_]/;
        while (i < source.length && hexDigits.test(source[i])) { s += source[i]; col++; i++; }
      } else {
        while (i < source.length && /[0-9_]/.test(source[i])) { s += source[i]; col++; i++; }
        if (i < source.length && source[i] === '.') {
          s += '.'; col++; i++;
          while (i < source.length && /[0-9_]/.test(source[i])) { s += source[i]; col++; i++; }
        }
        if (i < source.length && (source[i] === 'e' || source[i] === 'E')) {
          s += source[i]; col++; i++;
          if (i < source.length && (source[i] === '+' || source[i] === '-')) { s += source[i]; col++; i++; }
          while (i < source.length && /[0-9]/.test(source[i])) { s += source[i]; col++; i++; }
        }
        if (i < source.length && source[i] === 'n') { s += 'n'; col++; i++; } // BigInt
      }
      addToken('number', s, tLine, tCol);
      continue;
    }

    // ── Identifiers and keywords ───────────────────────────────
    if (/[a-zA-Z_$]/.test(ch)) {
      let s = '';
      while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) { s += source[i]; col++; i++; }
      addToken(KEYWORDS.has(s) ? 'keyword' : 'identifier', s, tLine, tCol);
      continue;
    }

    // ── Regex literal ──────────────────────────────────────────
    if (ch === '/' && isRegexContext(lastSignificant)) {
      let s = '/';
      i++; col++;
      let inCharClass = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          s += c + (source[i + 1] || ''); col += 2; i += 2; continue;
        }
        if (c === '[') { inCharClass = true; s += c; col++; i++; continue; }
        if (c === ']') { inCharClass = false; s += c; col++; i++; continue; }
        if (c === '/' && !inCharClass) { s += c; col++; i++; break; }
        if (c === '\n') break; // unterminated regex
        s += c; col++; i++;
      }
      // Flags
      while (i < source.length && /[gimsuy]/.test(source[i])) { s += source[i]; col++; i++; }
      addToken('regex', s, tLine, tCol);
      continue;
    }

    // ── Operators ──────────────────────────────────────────────
    let opMatched = false;
    for (const op of OPERATORS) {
      if (source.startsWith(op, i)) {
        addToken('operator', op, tLine, tCol);
        col += op.length; i += op.length;
        opMatched = true;
        break;
      }
    }
    if (opMatched) continue;

    // ── Punctuation ────────────────────────────────────────────
    if (PUNCTUATION.has(ch)) {
      addToken('punctuation', ch, tLine, tCol);
      col++; i++;
      continue;
    }

    // ── Unknown character ──────────────────────────────────────
    addToken('unknown', ch, tLine, tCol);
    col++; i++;
  }

  return tokens;
}
