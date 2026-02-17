/**
 * complexity.js — Cyclomatic complexity analyzer.
 *
 * Cyclomatic complexity = 1 + number of decision branches.
 * Branches counted: if, else, for, while, do, case, catch, &&, ||, ??, ?
 *
 * Strategy: Walk the token stream, track function scopes via brace depth,
 * count branch-inducing tokens. Handles default parameters like `opts = {}`
 * by finding the actual function body `{` after the `)` that closes params.
 */

const BRANCH_KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'case', 'catch']);

/**
 * Given a token array and the index of the `(` that opens a parameter list,
 * return the index of the matching `)`.
 */
function findMatchingParen(tokens, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punctuation' && t.value === '(') depth++;
    if (t.type === 'punctuation' && t.value === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Find the index of the `{` that starts the function body (after params close).
 * Returns -1 if not found (expression-body arrow function).
 */
function findFunctionBodyBrace(tokens, afterIdx) {
  for (let i = afterIdx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'comment') continue;
    if (t.type === 'punctuation' && t.value === '{') return i;
    // If we hit something that can't appear between `)` and `{`, stop
    // (e.g., another `function`, `=`, `;`)
    if (t.type === 'keyword' || t.type === 'operator' || t.type === 'identifier') break;
    if (t.type === 'punctuation' && t.value !== '{') break;
  }
  return -1;
}

/**
 * Pre-scan tokens to build a list of function records:
 * { name, line, tokenIdx (of `function` keyword or `=>`), bodyOpenIdx (index in tokens of `{`) }
 */
function discoverFunctions(tokens) {
  const functions = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'comment') continue;

    // ── `function` keyword ──────────────────────────────────
    if (tok.type === 'keyword' && tok.value === 'function') {
      let name = '(anonymous)';
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === 'comment') j++;

      // Optional: function name
      if (j < tokens.length && tokens[j].type === 'identifier') {
        name = tokens[j].value;
        j++;
        while (j < tokens.length && tokens[j].type === 'comment') j++;
      }

      // Find the opening `(` of params
      while (j < tokens.length && !(tokens[j].type === 'punctuation' && tokens[j].value === '(')) j++;
      if (j >= tokens.length) continue;

      // Skip to matching `)`
      const closeParenIdx = findMatchingParen(tokens, j);
      if (closeParenIdx === -1) continue;

      // Find the `{` after `)`
      let bodyIdx = closeParenIdx + 1;
      while (bodyIdx < tokens.length && tokens[bodyIdx].type === 'comment') bodyIdx++;
      if (bodyIdx < tokens.length && tokens[bodyIdx].type === 'punctuation' && tokens[bodyIdx].value === '{') {
        functions.push({ name, line: tok.line, tokenIdx: i, bodyOpenIdx: bodyIdx });
      }
      // If followed by something else (shouldn't happen for normal function declarations)
      continue;
    }

    // ── Arrow function `=>` ─────────────────────────────────
    if (tok.type === 'operator' && tok.value === '=>') {
      // Determine name: look backwards for `const name =` pattern
      let name = '(arrow)';
      for (let b = i - 1; b >= 0; b--) {
        const bt = tokens[b];
        if (bt.type === 'comment') continue;
        if (bt.type === 'identifier') { name = bt.value; break; }
        if (bt.type === 'operator' && bt.value === '=') continue;
        if (bt.type === 'punctuation' && bt.value === ')') break;
        break;
      }

      // Check if body is a block `{`
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === 'comment') j++;
      if (j < tokens.length && tokens[j].type === 'punctuation' && tokens[j].value === '{') {
        functions.push({ name, line: tok.line, tokenIdx: i, bodyOpenIdx: j });
      }
      continue;
    }
  }

  return functions;
}

/**
 * Analyze cyclomatic complexity per function.
 * @param {Array} tokens - Token array from tokenizer.
 * @returns {Array<{name: string, line: number, complexity: number}>}
 */
export function analyzeComplexity(tokens) {
  // Discover function start positions (body `{` index and brace depth at that point)
  const fnDefs = discoverFunctions(tokens);
  if (fnDefs.length === 0) return [];

  // Compute cumulative brace depth at each token index
  // depthAfter[i] = brace depth AFTER processing token i
  const depthBefore = new Array(tokens.length).fill(0);
  let d = 0;
  for (let i = 0; i < tokens.length; i++) {
    depthBefore[i] = d;
    const t = tokens[i];
    if (t.type === 'punctuation' && t.value === '{') d++;
    else if (t.type === 'punctuation' && t.value === '}') d--;
    if (d < 0) d = 0;
  }

  // For each function, we know:
  // - bodyOpenIdx: index of the `{` token that opens the body
  // - bodyDepth: depthBefore[bodyOpenIdx] + 1 (depth while inside the body)
  // We need to find the matching `}` and walk tokens in [bodyOpenIdx+1, bodyCloseIdx)
  // counting branches.

  const results = [];

  for (const fn of fnDefs) {
    const { name, line, bodyOpenIdx } = fn;
    const bodyDepth = depthBefore[bodyOpenIdx] + 1; // depth inside the function body

    // Find the matching closing `}` for this function
    let bodyCloseIdx = -1;
    let depth2 = 0;
    for (let i = bodyOpenIdx; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'punctuation' && t.value === '{') depth2++;
      else if (t.type === 'punctuation' && t.value === '}') {
        depth2--;
        if (depth2 === 0) { bodyCloseIdx = i; break; }
      }
    }
    if (bodyCloseIdx === -1) bodyCloseIdx = tokens.length - 1;

    // Walk tokens in the function body, counting branches
    let complexity = 1;

    for (let i = bodyOpenIdx + 1; i < bodyCloseIdx; i++) {
      const tok = tokens[i];
      if (tok.type === 'comment') continue;

      // Count keyword branches
      if (tok.type === 'keyword' && BRANCH_KEYWORDS.has(tok.value)) {
        if (tok.value === 'else') {
          // else if → don't count 'else', the 'if' will be counted
          let j = i + 1;
          while (j < tokens.length && tokens[j].type === 'comment') j++;
          if (j < tokens.length && tokens[j].type === 'keyword' && tokens[j].value === 'if') {
            // skip — the 'if' will be counted next iteration
          } else {
            complexity++; // bare else
          }
        } else {
          complexity++;
        }
      }

      // Count logical operator branches
      if (tok.type === 'operator') {
        if (tok.value === '&&' || tok.value === '||' || tok.value === '??') {
          complexity++;
        }
        if (tok.value === '?') {
          // Ternary `?` — make sure it's not `?.` (optional chaining already tokenized separately)
          complexity++;
        }
      }
    }

    results.push({ name, line, complexity });
  }

  return results;
}
