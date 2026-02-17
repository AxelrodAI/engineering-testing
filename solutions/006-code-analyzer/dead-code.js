/**
 * dead-code.js — Detect unreachable code after return/throw/break/continue.
 *
 * Strategy: Walk the token stream. When we see a definite jump keyword
 * (return/throw/break/continue) that is NOT inside a braceless control-flow
 * statement (if/else/for/while/do), check whether the next statement at the
 * same brace depth is inside the same block. If so, report it as unreachable.
 *
 * Handles:
 *  - `return { ... };`  — object literal, NOT a new block
 *  - `if (x) return;`   — braceless if, next statement is NOT dead
 *  - `for (...) break;` — braceless for, next statement is NOT dead
 */

const JUMP_KEYWORDS = new Set(['return', 'throw', 'break', 'continue']);
const BRACELESS_CTRL = new Set(['if', 'else', 'for', 'while', 'do']);

/**
 * Given the significant token array, the index of a jump keyword,
 * and the brace depth at that position, determine whether this jump
 * is inside a braceless control-flow statement (i.e., not a standalone jump).
 *
 * Strategy: look backward from jumpIdx for the most recent token at the same
 * depth that could introduce a braceless control flow.
 */
function isInsideBracelessControl(sig, jumpIdx, depthBefore) {
  const jumpDepth = depthBefore[jumpIdx];

  for (let i = jumpIdx - 1; i >= 0; i--) {
    const tok = sig[i];
    const d = depthBefore[i];

    // Only look at tokens at the same depth
    if (d > jumpDepth) continue;
    if (d < jumpDepth) break; // went out of scope

    // `)` at the same depth could close a control-flow condition
    if (tok.type === 'punctuation' && tok.value === ')') {
      // Look before the `(` to find the control keyword
      // Find the matching `(`
      let depth = 0;
      for (let j = i; j >= 0; j--) {
        if (sig[j].type === 'punctuation' && sig[j].value === ')') depth++;
        if (sig[j].type === 'punctuation' && sig[j].value === '(') {
          depth--;
          if (depth === 0) {
            // Check token before `(`
            let k = j - 1;
            while (k >= 0 && sig[k].type === 'comment') k--;
            if (k >= 0 && sig[k].type === 'keyword' && BRACELESS_CTRL.has(sig[k].value)) {
              return true; // this jump is inside a braceless if/for/while
            }
            break;
          }
        }
      }
      return false;
    }

    // `{` at the same depth means we're inside a block — not a braceless control flow
    if (tok.type === 'punctuation' && tok.value === '{') return false;

    // `;` at the same depth — previous statement ended, this is a standalone jump
    if (tok.type === 'punctuation' && tok.value === ';') return false;

    // `else` keyword at same depth — bare else body, it's a braceless control
    if (tok.type === 'keyword' && tok.value === 'else') return true;
  }

  return false; // reached start of file — assume standalone
}

/**
 * Detect unreachable code in a token stream.
 * @param {Array} tokens - Token array from tokenizer.
 * @param {string[]} lines - Source lines for snippet extraction.
 * @returns {Array<{line: number, col: number, message: string, kind: string, snippet: string}>}
 */
export function detectDeadCode(tokens, lines = []) {
  const issues = [];

  // Filter to significant tokens (no comments)
  const sig = tokens.filter(t => t.type !== 'comment');

  // Compute brace depth BEFORE each token
  const depthBefore = [];
  let d = 0;
  for (const tok of sig) {
    depthBefore.push(d);
    if (tok.type === 'punctuation' && tok.value === '{') d++;
    else if (tok.type === 'punctuation' && tok.value === '}') { d--; if (d < 0) d = 0; }
  }

  for (let i = 0; i < sig.length; i++) {
    const tok = sig[i];
    if (tok.type !== 'keyword' || !JUMP_KEYWORDS.has(tok.value)) continue;

    const jumpDepth = depthBefore[i];

    // Skip if this jump is inside a braceless control flow (e.g., `if (x) return;`)
    if (isInsideBracelessControl(sig, i, depthBefore)) continue;

    // Advance past the jump's own statement expression.
    // Properly handle nested braces (e.g., `return { a: 1 };`)
    let j = i + 1;
    let nestDepth = 0;

    while (j < sig.length) {
      const t = sig[j];

      // Track nested delimiters within the return expression
      if (t.type === 'punctuation' && (t.value === '{' || t.value === '(' || t.value === '[')) {
        nestDepth++;
        j++;
        continue;
      }
      if (t.type === 'punctuation' && (t.value === '}' || t.value === ')' || t.value === ']')) {
        if (nestDepth > 0) {
          nestDepth--;
          j++;
          continue;
        }
        // nestDepth === 0: this `}` closes the containing block — stop here
        break;
      }

      // Semicolon at nest depth 0 ends the statement
      if (t.type === 'punctuation' && t.value === ';' && nestDepth === 0) {
        j++; // consume `;`
        break;
      }

      j++;
    }

    // j now points to the first token after the jump statement
    if (j >= sig.length) continue;

    const nextTok = sig[j];

    // If next token is `}`, the block ends — no dead code
    if (nextTok.type === 'punctuation' && nextTok.value === '}') continue;

    // If we went to a different depth, we're out of the block
    if (depthBefore[j] !== jumpDepth) continue;

    // Same block, same depth → dead code
    issues.push({
      line: nextTok.line,
      col: nextTok.col,
      message: `Unreachable code after '${tok.value}' (at line ${tok.line})`,
      kind: 'dead-code',
      snippet: lines[nextTok.line - 1] ? lines[nextTok.line - 1].trim() : '',
    });

    // Advance i to j to avoid duplicate reports for the same dead block
    // (but allow reporting each dead statement once)
    i = j - 1; // will be incremented by the loop
  }

  return issues;
}
