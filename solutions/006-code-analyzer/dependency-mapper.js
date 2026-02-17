/**
 * dependency-mapper.js — Parse import/require statements and detect circular dependencies.
 *
 * Supports:
 *   - ESM: import X from 'y'; import { a, b } from 'y'; import * as ns from 'y';
 *   - CJS: require('y'); const x = require('y');
 *   - Dynamic: import('y') — detected but not graph-followed
 *
 * Circular detection: DFS on the adjacency list.
 */

/**
 * Parse all import/require declarations from a token stream.
 * @param {Array} tokens - Tokens from tokenizer.
 * @param {string} filePath - The file path (used as graph node key).
 * @returns {{ imports: Array<{source: string, kind: string, line: number}> }}
 */
export function parseImports(tokens, filePath = '<unknown>') {
  const imports = [];
  const sig = tokens.filter(t => t.type !== 'comment');

  for (let i = 0; i < sig.length; i++) {
    const tok = sig[i];

    // ── ESM static import ──────────────────────────────────
    // import ... from 'source'
    if (tok.type === 'keyword' && tok.value === 'import') {
      const next = sig[i + 1];
      if (!next) continue;

      // import('source') — dynamic import
      if (next.type === 'punctuation' && next.value === '(') {
        const src = sig[i + 2];
        if (src && (src.type === 'string' || src.type === 'template')) {
          imports.push({
            source: stripQuotes(src.value),
            kind: 'dynamic-import',
            line: tok.line,
          });
        }
        continue;
      }

      // Static import: find the `from` keyword then the string
      let j = i + 1;
      while (j < sig.length && !(sig[j].type === 'keyword' && sig[j].value === 'from')) {
        // Safety: if we hit a semicolon or another `import` without finding `from`, stop
        if (sig[j].type === 'punctuation' && sig[j].value === ';') break;
        if (sig[j].type === 'keyword' && sig[j].value === 'import' && j !== i) break;
        j++;
      }
      if (j < sig.length && sig[j].type === 'keyword' && sig[j].value === 'from') {
        const src = sig[j + 1];
        if (src && src.type === 'string') {
          imports.push({
            source: stripQuotes(src.value),
            kind: 'import',
            line: tok.line,
          });
        }
      }
      continue;
    }

    // ── ESM export ... from ─────────────────────────────────
    // export { x } from 'source'; export * from 'source';
    if (tok.type === 'keyword' && tok.value === 'export') {
      let j = i + 1;
      while (j < sig.length && !(sig[j].type === 'keyword' && sig[j].value === 'from')) {
        if (sig[j].type === 'punctuation' && sig[j].value === ';') break;
        j++;
      }
      if (j < sig.length && sig[j].type === 'keyword' && sig[j].value === 'from') {
        const src = sig[j + 1];
        if (src && src.type === 'string') {
          imports.push({
            source: stripQuotes(src.value),
            kind: 'export-from',
            line: tok.line,
          });
        }
      }
      continue;
    }

    // ── CommonJS require ────────────────────────────────────
    // require('source') or require("source")
    if (tok.type === 'identifier' && tok.value === 'require') {
      const paren = sig[i + 1];
      const src = sig[i + 2];
      if (paren && paren.type === 'punctuation' && paren.value === '(' &&
          src && (src.type === 'string')) {
        imports.push({
          source: stripQuotes(src.value),
          kind: 'require',
          line: tok.line,
        });
      }
      continue;
    }
  }

  return { file: filePath, imports };
}

/**
 * Build an adjacency-list dependency graph from multiple file analyses.
 * @param {Array<{file: string, imports: Array<{source: string}>}>} fileData
 * @returns {Map<string, Set<string>>} adjacency list (file → Set of imported files)
 */
export function buildGraph(fileData) {
  const graph = new Map();

  for (const { file, imports } of fileData) {
    if (!graph.has(file)) graph.set(file, new Set());
    for (const imp of imports) {
      // Resolve relative imports to absolute-ish paths for graph purposes
      const resolved = resolveImport(file, imp.source);
      graph.get(file).add(resolved);
      if (!graph.has(resolved)) graph.set(resolved, new Set());
    }
  }

  return graph;
}

/**
 * Detect circular dependencies via DFS.
 * @param {Map<string, Set<string>>} graph
 * @returns {Array<string[]>} List of circular dependency chains.
 */
export function detectCircularDeps(graph) {
  const cycles = [];
  const visited = new Set();
  const inStack = new Set();

  function dfs(node, path) {
    if (inStack.has(node)) {
      // Found a cycle — extract the cycle portion of the path
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      dfs(neighbor, path);
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

/**
 * Full dependency analysis for a set of files.
 * @param {Array<{file: string, tokens: Array}>} files
 * @returns {{ graph: Map, cycles: Array, allImports: Array }}
 */
export function analyzeDependencies(files) {
  const fileData = files.map(({ file, tokens }) => parseImports(tokens, file));
  const graph = buildGraph(fileData);
  const cycles = detectCircularDeps(graph);

  return {
    graph,
    cycles,
    allImports: fileData,
  };
}

// ── Helpers ────────────────────────────────────────────────

function stripQuotes(s) {
  return s.replace(/^['"`]|['"`]$/g, '');
}

/**
 * Resolve an import specifier relative to the importing file.
 * For non-relative specifiers (packages), returns the specifier as-is.
 */
function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return specifier; // package import

  // Simple path resolution
  const parts = fromFile.split('/');
  parts.pop(); // remove filename
  const specParts = specifier.split('/');

  for (const part of specParts) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }

  // Add .js if no extension
  const resolved = parts.join('/');
  if (!resolved.includes('.')) return resolved + '.js';
  return resolved;
}
