/**
 * reporter.js — Structured JSON output + human-readable ANSI summary.
 */

// ANSI color helpers
const ansi = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

function c(color, text) {
  return `${ansi[color]}${text}${ansi.reset}`;
}

/**
 * Render an analysis result as structured JSON.
 * @param {object} result - Output from analyze()
 * @returns {string} Pretty-printed JSON
 */
export function toJSON(result) {
  // Convert Map to plain object for serialization
  const serializable = {
    ...result,
    dependencies: result.dependencies
      ? {
          ...result.dependencies,
          graph: result.dependencies.graph
            ? Object.fromEntries(
                [...result.dependencies.graph.entries()].map(([k, v]) => [k, [...v]])
              )
            : undefined,
        }
      : undefined,
  };
  return JSON.stringify(serializable, null, 2);
}

/**
 * Render an analysis result as a human-readable ANSI string.
 * @param {object} result - Output from analyze()
 * @param {object} opts
 * @param {boolean} opts.noColor - Strip ANSI codes
 * @returns {string}
 */
export function toHuman(result, { noColor = false } = {}) {
  const lines = [];

  const colored = noColor
    ? (_, text) => text
    : c;

  const { file, complexity, deadCode, style, dependencies } = result;

  lines.push('');
  lines.push(colored('bold', `Analysis: ${colored('cyan', file || '<source>')}`));
  lines.push(colored('dim', '─'.repeat(60)));

  // ── Complexity ──────────────────────────────────────────
  if (complexity && complexity.length > 0) {
    lines.push('');
    lines.push(colored('bold', '📊 Cyclomatic Complexity'));
    for (const fn of complexity) {
      const cc = fn.complexity;
      const level = cc <= 5 ? colored('green', `${cc}`) : cc <= 10 ? colored('yellow', `${cc}`) : colored('red', `${cc}`);
      const label = cc <= 5 ? 'low' : cc <= 10 ? 'moderate' : 'high';
      lines.push(`  ${colored('cyan', fn.name)} (line ${fn.line}) — complexity: ${level} ${colored('dim', `[${label}]`)}`);
    }
  }

  // ── Dead Code ───────────────────────────────────────────
  if (deadCode && deadCode.length > 0) {
    lines.push('');
    lines.push(colored('bold', '💀 Dead Code'));
    for (const issue of deadCode) {
      lines.push(`  ${colored('yellow', `line ${issue.line}:${issue.col}`)} — ${issue.message}`);
      if (issue.snippet) lines.push(`    ${colored('dim', issue.snippet)}`);
    }
  } else if (deadCode) {
    lines.push('');
    lines.push(`${colored('green', '✓')} No dead code detected`);
  }

  // ── Style Issues ────────────────────────────────────────
  if (style && style.length > 0) {
    lines.push('');
    lines.push(colored('bold', '🎨 Style Issues'));
    const ruleGroups = {};
    for (const issue of style) {
      if (!ruleGroups[issue.rule]) ruleGroups[issue.rule] = [];
      ruleGroups[issue.rule].push(issue);
    }
    for (const [rule, issues] of Object.entries(ruleGroups)) {
      lines.push(`  ${colored('magenta', rule)} (${issues.length} occurrence${issues.length !== 1 ? 's' : ''})`);
      for (const issue of issues.slice(0, 5)) { // Show max 5 per rule
        lines.push(`    ${colored('yellow', `line ${issue.line}:${issue.col}`)} — ${issue.message}`);
      }
      if (issues.length > 5) {
        lines.push(`    ${colored('dim', `... and ${issues.length - 5} more`)}`);
      }
    }
  } else if (style) {
    lines.push('');
    lines.push(`${colored('green', '✓')} No style issues`);
  }

  // ── Dependencies ────────────────────────────────────────
  if (dependencies) {
    const { allImports, cycles } = dependencies;
    if (allImports && allImports.length > 0) {
      lines.push('');
      lines.push(colored('bold', '📦 Dependencies'));
      for (const fi of allImports) {
        if (fi.imports.length === 0) continue;
        lines.push(`  ${colored('cyan', fi.file)}`);
        for (const imp of fi.imports) {
          const kindColor = imp.kind === 'require' ? 'yellow' : 'blue';
          lines.push(`    ${colored(kindColor, imp.kind)} ${colored('white', imp.source)} ${colored('dim', `(line ${imp.line})`)}`);
        }
      }
    }
    if (cycles && cycles.length > 0) {
      lines.push('');
      lines.push(colored('red', '⚠️  Circular Dependencies Detected!'));
      for (const cycle of cycles) {
        lines.push(`  ${colored('red', cycle.join(' → '))}`);
      }
    } else if (dependencies) {
      lines.push('');
      lines.push(`${colored('green', '✓')} No circular dependencies`);
    }
  }

  // ── Summary ──────────────────────────────────────────────
  lines.push('');
  lines.push(colored('dim', '─'.repeat(60)));
  const totalIssues = (deadCode?.length || 0) + (style?.length || 0) + (dependencies?.cycles?.length || 0);
  const highComplexity = complexity ? complexity.filter(f => f.complexity > 10).length : 0;

  if (totalIssues === 0 && highComplexity === 0) {
    lines.push(colored('green', '✓ All checks passed — no issues found'));
  } else {
    const parts = [];
    if (totalIssues > 0) parts.push(`${totalIssues} issue${totalIssues !== 1 ? 's' : ''}`);
    if (highComplexity > 0) parts.push(`${highComplexity} high-complexity function${highComplexity !== 1 ? 's' : ''}`);
    lines.push(colored('yellow', `⚠ Found: ${parts.join(', ')}`));
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Print analysis to stdout.
 * @param {object} result
 * @param {'human'|'json'} format
 */
export function report(result, format = 'human') {
  if (format === 'json') {
    process.stdout.write(toJSON(result) + '\n');
  } else {
    process.stdout.write(toHuman(result) + '\n');
  }
}
