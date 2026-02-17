/**
 * index.js — Public API for the static code analyzer.
 *
 * Usage:
 *   import { analyze } from './index.js';
 *   const result = analyze(source, { file: 'foo.js', rules: { noConsole: false } });
 */

import { tokenize } from './tokenizer.js';
import { analyzeComplexity } from './complexity.js';
import { detectDeadCode } from './dead-code.js';
import { checkStyle } from './style-checker.js';
import { parseImports, buildGraph, detectCircularDeps } from './dependency-mapper.js';

/**
 * Analyze JavaScript source code.
 *
 * @param {string} source - The JavaScript source to analyze.
 * @param {object} [options={}]
 * @param {string} [options.file='<source>'] - File name/path (used in reports).
 * @param {object} [options.rules={}] - Style rule overrides (see style-checker.js).
 * @param {boolean} [options.skipComplexity=false]
 * @param {boolean} [options.skipDeadCode=false]
 * @param {boolean} [options.skipStyle=false]
 * @param {boolean} [options.skipDependencies=false]
 * @param {Array<{file: string, tokens: Array}>} [options.otherFiles=[]] - Other files for graph analysis.
 * @returns {{
 *   file: string,
 *   tokens: Array,
 *   complexity: Array,
 *   deadCode: Array,
 *   style: Array,
 *   dependencies: object,
 *   summary: object
 * }}
 */
export function analyze(source, options = {}) {
  const {
    file = '<source>',
    rules = {},
    skipComplexity = false,
    skipDeadCode = false,
    skipStyle = false,
    skipDependencies = false,
    otherFiles = [],
  } = options;

  if (typeof source !== 'string') {
    throw new TypeError('analyze: source must be a string');
  }

  const lines = source.split('\n');
  const tokens = tokenize(source);

  const complexity = skipComplexity ? [] : analyzeComplexity(tokens);
  const deadCode = skipDeadCode ? [] : detectDeadCode(tokens, lines);
  const style = skipStyle ? [] : checkStyle(source, tokens, rules);

  let dependencies = null;
  if (!skipDependencies) {
    const thisFile = { file, tokens };
    const allFiles = [thisFile, ...otherFiles];
    const allData = allFiles.map(f => parseImports(f.tokens, f.file));
    const graph = buildGraph(allData);
    const cycles = detectCircularDeps(graph);
    const myImports = allData.find(d => d.file === file) || { file, imports: [] };

    dependencies = {
      graph,
      cycles,
      allImports: [myImports],
      imports: myImports.imports,
    };
  }

  // Summary statistics
  const summary = {
    totalTokens: tokens.length,
    functions: complexity.length,
    avgComplexity: complexity.length > 0
      ? +(complexity.reduce((s, f) => s + f.complexity, 0) / complexity.length).toFixed(2)
      : 0,
    maxComplexity: complexity.length > 0 ? Math.max(...complexity.map(f => f.complexity)) : 0,
    deadCodeIssues: deadCode.length,
    styleIssues: style.length,
    circularDeps: dependencies?.cycles?.length || 0,
    totalIssues: deadCode.length + style.length + (dependencies?.cycles?.length || 0),
  };

  return {
    file,
    tokens,
    complexity,
    deadCode,
    style,
    dependencies,
    summary,
  };
}

/**
 * Analyze multiple files together (enables cross-file dependency analysis).
 * @param {Array<{file: string, source: string}>} files
 * @param {object} [options={}] - Same options as analyze(), applied to all files.
 * @returns {Array} One result per file.
 */
export function analyzeFiles(files, options = {}) {
  // First pass: tokenize all files
  const tokenized = files.map(({ file, source }) => ({
    file,
    source,
    tokens: tokenize(source),
  }));

  // Second pass: analyze each file with all other files for dep graph
  return tokenized.map(({ file, source, tokens }) => {
    const otherFiles = tokenized
      .filter(f => f.file !== file)
      .map(f => ({ file: f.file, tokens: f.tokens }));

    return analyze(source, { ...options, file, otherFiles });
  });
}

// Re-export sub-modules for direct usage
export { tokenize } from './tokenizer.js';
export { analyzeComplexity } from './complexity.js';
export { detectDeadCode } from './dead-code.js';
export { checkStyle, DEFAULT_RULES } from './style-checker.js';
export { parseImports, buildGraph, detectCircularDeps, analyzeDependencies } from './dependency-mapper.js';
export { toJSON, toHuman, report } from './reporter.js';
