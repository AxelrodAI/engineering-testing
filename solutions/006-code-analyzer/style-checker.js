/**
 * style-checker.js — Configurable style rules for JavaScript source.
 *
 * Rules:
 *   maxLineLength  — flag lines exceeding N characters (default 120)
 *   noVar          — flag `var` declarations
 *   noConsole      — flag `console.log` / `console.error` / `console.warn` usage
 *   camelCase      — flag identifiers that aren't camelCase, PascalCase, SCREAMING_SNAKE, or _private
 *   noTrailingWhitespace — flag lines with trailing spaces/tabs
 *   noDebugger     — flag `debugger` statements
 */

/**
 * Default rule configuration.
 */
export const DEFAULT_RULES = {
  maxLineLength: 120,
  noVar: true,
  noConsole: true,
  camelCase: true,
  noTrailingWhitespace: true,
  noDebugger: true,
};

// Identifiers that are allowed as-is (globals, acronyms, etc.)
const CAMEL_WHITELIST = new Set([
  'URL', 'ID', 'OK', 'API', 'HTTP', 'HTTPS', 'JSON', 'HTML', 'CSS',
  'DOM', 'RPC', 'SQL', 'TCP', 'UDP', 'TTL', 'UUID', 'XML',
]);

/**
 * Check if an identifier follows naming conventions:
 * - camelCase: starts lowercase, no underscores except leading _
 * - PascalCase: starts uppercase (classes)
 * - SCREAMING_SNAKE_CASE: all-caps with underscores (constants)
 * - _private: leading underscore then camelCase
 */
function isValidIdentifier(name) {
  if (CAMEL_WHITELIST.has(name)) return true;
  // Single character — always OK
  if (name.length === 1) return true;
  // SCREAMING_SNAKE: uppercase letters + underscores + digits
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return true;
  // PascalCase: starts uppercase, rest alphanumeric
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return true;
  // camelCase: starts lowercase or _, no consecutive underscores, no trailing _
  if (/^_?[a-z][a-zA-Z0-9]*$/.test(name)) return true;
  // Leading underscore + camelCase (_myVar)
  if (/^_[a-z][a-zA-Z0-9]*$/.test(name)) return true;
  // __privateField or #privateField patterns
  if (/^__?[a-zA-Z][a-zA-Z0-9]*$/.test(name)) return true;
  // $ prefix (jQuery, special vars)
  if (/^\$[a-zA-Z0-9_]*$/.test(name)) return true;
  return false;
}

/**
 * Run style checks on a source string + token stream.
 * @param {string} source - Full source text.
 * @param {Array} tokens - Tokens from tokenizer.
 * @param {object} rules - Rule config (merged with DEFAULT_RULES).
 * @returns {Array<{line: number, col: number, rule: string, message: string}>}
 */
export function checkStyle(source, tokens, rules = {}) {
  const cfg = { ...DEFAULT_RULES, ...rules };
  const issues = [];
  const lines = source.split('\n');

  // ── Line-level checks ─────────────────────────────────────
  lines.forEach((ln, idx) => {
    const lineNum = idx + 1;

    if (cfg.maxLineLength && ln.length > cfg.maxLineLength) {
      issues.push({
        line: lineNum,
        col: cfg.maxLineLength + 1,
        rule: 'max-line-length',
        message: `Line is ${ln.length} characters (max ${cfg.maxLineLength})`,
      });
    }

    if (cfg.noTrailingWhitespace && /[ \t]+$/.test(ln)) {
      issues.push({
        line: lineNum,
        col: ln.search(/[ \t]+$/) + 1,
        rule: 'no-trailing-whitespace',
        message: 'Trailing whitespace',
      });
    }
  });

  // ── Token-level checks ────────────────────────────────────
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Skip tokens inside comments
    if (tok.type === 'comment') continue;

    // ── no-var ──────────────────────────────────────────────
    if (cfg.noVar && tok.type === 'keyword' && tok.value === 'var') {
      issues.push({
        line: tok.line,
        col: tok.col,
        rule: 'no-var',
        message: "Use 'let' or 'const' instead of 'var'",
      });
    }

    // ── no-debugger ─────────────────────────────────────────
    if (cfg.noDebugger && tok.type === 'keyword' && tok.value === 'debugger') {
      issues.push({
        line: tok.line,
        col: tok.col,
        rule: 'no-debugger',
        message: "'debugger' statement should not be in production code",
      });
    }

    // ── no-console ──────────────────────────────────────────
    if (cfg.noConsole && tok.type === 'identifier' && tok.value === 'console') {
      // Look ahead: console . <method>
      const next = tokens[i + 1];
      const method = tokens[i + 2];
      if (next && next.type === 'punctuation' && next.value === '.') {
        const methodName = method ? method.value : '';
        issues.push({
          line: tok.line,
          col: tok.col,
          rule: 'no-console',
          message: `console.${methodName} should not be used in production code`,
        });
      }
    }

    // ── camelCase naming ────────────────────────────────────
    if (cfg.camelCase && tok.type === 'identifier') {
      // Skip: short names, common globals, and names used as property access targets
      const prev = i > 0 ? tokens[i - 1] : null;
      // Skip property access: obj.BadName — after a `.`
      if (prev && prev.type === 'punctuation' && prev.value === '.') continue;
      // Skip import paths and specifiers (after `from`, `import`)
      const prevKeyword = findPrevSignificant(tokens, i, 1);
      if (prevKeyword && prevKeyword.type === 'keyword' &&
          (prevKeyword.value === 'from' || prevKeyword.value === 'import')) continue;

      if (!isValidIdentifier(tok.value)) {
        issues.push({
          line: tok.line,
          col: tok.col,
          rule: 'camel-case',
          message: `Identifier '${tok.value}' does not follow naming conventions (camelCase/PascalCase/SCREAMING_SNAKE)`,
        });
      }
    }
  }

  // Sort by line then col
  issues.sort((a, b) => a.line !== b.line ? a.line - b.line : a.col - b.col);
  return issues;
}

/** Find the nth previous significant (non-comment) token. */
function findPrevSignificant(tokens, idx, n) {
  let count = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (tokens[i].type === 'comment') continue;
    count++;
    if (count === n) return tokens[i];
  }
  return null;
}
