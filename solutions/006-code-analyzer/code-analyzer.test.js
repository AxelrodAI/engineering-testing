/**
 * code-analyzer.test.js — Tests for the static code analyzer.
 * Uses node:test + node:assert, ESM.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from './tokenizer.js';
import { analyzeComplexity } from './complexity.js';
import { detectDeadCode } from './dead-code.js';
import { checkStyle } from './style-checker.js';
import { parseImports, buildGraph, detectCircularDeps } from './dependency-mapper.js';
import { analyze } from './index.js';
import { toJSON, toHuman } from './reporter.js';

// ══════════════════════════════════════════════════════════════
//  TOKENIZER TESTS
// ══════════════════════════════════════════════════════════════

describe('Tokenizer', () => {
  test('tokenizes keywords', () => {
    const src = 'if (x) { return; }';
    const tokens = tokenize(src);
    const types = tokens.map(t => t.type);
    assert.ok(types.includes('keyword'));
    const kws = tokens.filter(t => t.type === 'keyword').map(t => t.value);
    assert.deepEqual(kws, ['if', 'return']);
  });

  test('tokenizes identifiers', () => {
    const src = 'const foo = bar;';
    const tokens = tokenize(src);
    const ids = tokens.filter(t => t.type === 'identifier').map(t => t.value);
    assert.ok(ids.includes('foo'));
    assert.ok(ids.includes('bar'));
  });

  test('tokenizes numbers — integer, float, hex', () => {
    const src = '42 3.14 0xFF 0b1010 0o777';
    const tokens = tokenize(src);
    const nums = tokens.filter(t => t.type === 'number').map(t => t.value);
    assert.equal(nums.length, 5);
    assert.equal(nums[0], '42');
    assert.equal(nums[1], '3.14');
    assert.equal(nums[2], '0xFF');
    assert.equal(nums[3], '0b1010');
    assert.equal(nums[4], '0o777');
  });

  test('tokenizes string literals — single and double quoted', () => {
    const src = `"hello world" 'foo bar'`;
    const tokens = tokenize(src);
    const strs = tokens.filter(t => t.type === 'string').map(t => t.value);
    assert.equal(strs.length, 2);
    assert.equal(strs[0], '"hello world"');
    assert.equal(strs[1], "'foo bar'");
  });

  test('tokenizes string with escape sequences', () => {
    const src = String.raw`"line1\nline2" 'it\'s'`;
    const tokens = tokenize(src);
    const strs = tokens.filter(t => t.type === 'string');
    assert.equal(strs.length, 2);
    assert.ok(strs[0].value.includes('\\n'));
  });

  test('tokenizes template literals', () => {
    const src = '`hello ${name}!`';
    const tokens = tokenize(src);
    const tmpl = tokens.filter(t => t.type === 'template');
    assert.equal(tmpl.length, 1);
    assert.ok(tmpl[0].value.startsWith('`'));
    assert.ok(tmpl[0].value.endsWith('`'));
  });

  test('tokenizes nested template literal expressions', () => {
    const src = '`${a ? `inner ${b}` : c}`';
    const tokens = tokenize(src);
    const tmpl = tokens.filter(t => t.type === 'template');
    assert.equal(tmpl.length, 1);
  });

  test('tokenizes single-line comments', () => {
    const src = '// this is a comment\nconst x = 1;';
    const tokens = tokenize(src);
    const comments = tokens.filter(t => t.type === 'comment');
    assert.equal(comments.length, 1);
    assert.ok(comments[0].value.startsWith('//'));
  });

  test('tokenizes multi-line comments', () => {
    const src = '/* multi\nline\ncomment */\nconst x = 1;';
    const tokens = tokenize(src);
    const comments = tokens.filter(t => t.type === 'comment');
    assert.equal(comments.length, 1);
    assert.ok(comments[0].value.startsWith('/*'));
    assert.ok(comments[0].value.endsWith('*/'));
  });

  test('tokenizes operators', () => {
    const src = 'a === b && c !== d || e >= f';
    const tokens = tokenize(src);
    const ops = tokens.filter(t => t.type === 'operator').map(t => t.value);
    assert.ok(ops.includes('==='));
    assert.ok(ops.includes('&&'));
    assert.ok(ops.includes('!=='));
    assert.ok(ops.includes('||'));
    assert.ok(ops.includes('>='));
  });

  test('tokenizes punctuation', () => {
    const src = '{ ( [ ] ) }';
    const tokens = tokenize(src);
    const puncts = tokens.filter(t => t.type === 'punctuation').map(t => t.value);
    assert.ok(puncts.includes('{'));
    assert.ok(puncts.includes('('));
    assert.ok(puncts.includes('['));
    assert.ok(puncts.includes(']'));
    assert.ok(puncts.includes(')'));
    assert.ok(puncts.includes('}'));
  });

  test('disambiguates regex from division', () => {
    const src = `
      const re = /abc/g;
      const x = 10 / 2;
      if (/test/.test(s)) {}
    `;
    const tokens = tokenize(src);
    const regexes = tokens.filter(t => t.type === 'regex');
    assert.equal(regexes.length, 2, 'Should find 2 regex literals');
    // Make sure /2 is not tokenized as regex
    const ops = tokens.filter(t => t.type === 'operator' && t.value === '/');
    assert.equal(ops.length, 1, 'Should find 1 division operator');
  });

  test('handles regex with character classes and flags', () => {
    const src = `/[a-z0-9]+/gi`;
    const tokens = tokenize(src);
    const regex = tokens.find(t => t.type === 'regex');
    assert.ok(regex, 'Should tokenize as regex');
    assert.ok(regex.value.endsWith('gi'));
  });

  test('tracks line numbers correctly', () => {
    const src = `const a = 1;\nconst b = 2;\nconst c = 3;`;
    const tokens = tokenize(src);
    const cs = tokens.filter(t => t.value === 'const');
    assert.equal(cs[0].line, 1);
    assert.equal(cs[1].line, 2);
    assert.equal(cs[2].line, 3);
  });

  test('handles empty string', () => {
    const tokens = tokenize('');
    assert.deepEqual(tokens, []);
  });

  test('handles BigInt literal', () => {
    const src = '42n';
    const tokens = tokenize(src);
    assert.equal(tokens[0].type, 'number');
    assert.equal(tokens[0].value, '42n');
  });

  test('handles spread operator', () => {
    const src = 'const c = [...a, ...b];';
    const tokens = tokenize(src);
    const spreads = tokens.filter(t => t.type === 'operator' && t.value === '...');
    assert.equal(spreads.length, 2);
  });

  test('handles optional chaining ?.', () => {
    const src = 'a?.b?.c';
    const tokens = tokenize(src);
    const chains = tokens.filter(t => t.type === 'operator' && t.value === '?.');
    assert.equal(chains.length, 2);
  });

  test('handles arrow function =>', () => {
    const src = 'const fn = (x) => x * 2;';
    const tokens = tokenize(src);
    const arrows = tokens.filter(t => t.type === 'operator' && t.value === '=>');
    assert.equal(arrows.length, 1);
  });

  test('real fixture: stack.js snippet', () => {
    const src = `
export class Stack {
  #items;
  constructor() { this.#items = []; }
  push(value) { this.#items.push(value); return this.#items.length; }
  pop() { return this.#items.pop(); }
  isEmpty() { return this.#items.length === 0; }
}`;
    const tokens = tokenize(src);
    assert.ok(tokens.length > 10);
    const kws = tokens.filter(t => t.type === 'keyword').map(t => t.value);
    assert.ok(kws.includes('export'));
    assert.ok(kws.includes('class'));
    assert.ok(kws.includes('return'));
  });
});

// ══════════════════════════════════════════════════════════════
//  COMPLEXITY TESTS
// ══════════════════════════════════════════════════════════════

describe('Complexity Analyzer', () => {
  test('simple function has complexity 1', () => {
    const src = `function simple() { return 42; }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns.length, 1);
    assert.equal(fns[0].name, 'simple');
    assert.equal(fns[0].complexity, 1);
  });

  test('counts if branch', () => {
    const src = `function f() { if (x) { return 1; } return 2; }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].complexity, 2);
  });

  test('counts for loop', () => {
    const src = `function f() { for (let i = 0; i < 10; i++) { } }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].complexity, 2);
  });

  test('counts while loop', () => {
    const src = `function f() { while (x) { } }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].complexity, 2);
  });

  test('counts && and || operators', () => {
    const src = `function f() { return a && b || c; }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].complexity, 3); // 1 + && + ||
  });

  test('counts ternary operator', () => {
    const src = `function f() { return x ? 1 : 2; }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].complexity, 2); // 1 + ?
  });

  test('counts catch branch', () => {
    const src = `function f() { try { } catch(e) { } }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].complexity, 2); // 1 + catch
  });

  test('counts case branches', () => {
    const src = `function f(x) {
      switch (x) {
        case 1: return 'a';
        case 2: return 'b';
        case 3: return 'c';
        default: return 'd';
      }
    }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    // 1 + 3 cases + default? default doesn't count
    assert.ok(fns[0].complexity >= 4);
  });

  test('counts do-while', () => {
    const src = `function f() { do { x++; } while (x < 10); }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].complexity, 3); // 1 + do + while
  });

  test('detects arrow function names', () => {
    const src = `const myFn = (x) => { return x * 2; };`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns.length, 1);
    // Arrow function should have some name (myFn or arrow)
    assert.ok(fns[0].name.length > 0);
  });

  test('handles multiple functions', () => {
    const src = `
      function a() { if (x) return 1; }
      function b() { return 2; }
      function c() { for (;;) {} }
    `;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns.length, 3);
    const names = fns.map(f => f.name);
    assert.ok(names.includes('a'));
    assert.ok(names.includes('b'));
    assert.ok(names.includes('c'));
  });

  test('nested functions track independently', () => {
    const src = `
      function outer() {
        if (x) {
          function inner() {
            if (y) return 1;
            return 2;
          }
        }
        return 3;
      }
    `;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    // Both outer and inner should be tracked
    assert.ok(fns.length >= 2);
  });

  test('reports line number correctly', () => {
    const src = `\n\nfunction delayed() { return 1; }`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    assert.equal(fns[0].line, 3);
  });
});

// ══════════════════════════════════════════════════════════════
//  DEAD CODE TESTS
// ══════════════════════════════════════════════════════════════

describe('Dead Code Detector', () => {
  test('detects code after return', () => {
    const src = `function f() {
  return 1;
  const x = 2;
}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.equal(issues.length, 1);
    assert.ok(issues[0].message.includes('return'));
  });

  test('detects code after throw', () => {
    const src = `function f() {
  throw new Error('oops');
  console.log('never');
}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.equal(issues.length, 1);
    assert.ok(issues[0].message.includes('throw'));
  });

  test('detects code after break in switch', () => {
    const src = `function f(x) {
  switch(x) {
    case 1:
      break;
      console.log('dead');
    default:
      return 0;
  }
}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.ok(issues.length >= 1);
  });

  test('does not flag code after return in if branch', () => {
    const src = `function f() {
  if (x) {
    return 1;
  }
  return 2;
}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    // `return 2` is NOT dead — it's in the else branch
    assert.equal(issues.length, 0);
  });

  test('does not flag closing brace after return', () => {
    const src = `function f() { return 1; }`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.equal(issues.length, 0);
  });

  test('detects code after continue', () => {
    const src = `function f() {
  for (let i = 0; i < 10; i++) {
    continue;
    doSomething();
  }
}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.ok(issues.length >= 1);
  });

  test('reports line number of dead code', () => {
    const src = `function f() {\n  return 1;\n  const dead = 2;\n}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.equal(issues[0].line, 3);
  });

  test('no dead code in clean function', () => {
    const src = `
function clean(x) {
  if (x > 0) {
    return x;
  } else {
    return -x;
  }
}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.equal(issues.length, 0);
  });
});

// ══════════════════════════════════════════════════════════════
//  STYLE CHECKER TESTS
// ══════════════════════════════════════════════════════════════

describe('Style Checker', () => {
  test('flags var declarations', () => {
    const src = `var x = 1;\nconst y = 2;`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { noVar: true });
    const varIssues = issues.filter(i => i.rule === 'no-var');
    assert.equal(varIssues.length, 1);
    assert.equal(varIssues[0].line, 1);
  });

  test('flags console usage', () => {
    const src = `console.log('hello');\nconsole.error('bad');`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { noConsole: true });
    const consoleIssues = issues.filter(i => i.rule === 'no-console');
    assert.equal(consoleIssues.length, 2);
  });

  test('flags lines exceeding max length', () => {
    const longLine = 'x'.repeat(130);
    const src = `${longLine}\nshort line`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { maxLineLength: 120 });
    const lenIssues = issues.filter(i => i.rule === 'max-line-length');
    assert.equal(lenIssues.length, 1);
    assert.equal(lenIssues[0].line, 1);
  });

  test('respects custom maxLineLength', () => {
    const src = 'x'.repeat(50);
    const tokens = tokenize(src);
    const issuesLong = checkStyle(src, tokens, { maxLineLength: 80 });
    const issuesShort = checkStyle(src, tokens, { maxLineLength: 40 });
    assert.equal(issuesLong.filter(i => i.rule === 'max-line-length').length, 0);
    assert.equal(issuesShort.filter(i => i.rule === 'max-line-length').length, 1);
  });

  test('flags trailing whitespace', () => {
    const src = `const x = 1;   \nconst y = 2;`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { noTrailingWhitespace: true });
    const wsIssues = issues.filter(i => i.rule === 'no-trailing-whitespace');
    assert.equal(wsIssues.length, 1);
    assert.equal(wsIssues[0].line, 1);
  });

  test('flags debugger statement', () => {
    const src = `function f() { debugger; }`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { noDebugger: true });
    const dbgIssues = issues.filter(i => i.rule === 'no-debugger');
    assert.equal(dbgIssues.length, 1);
  });

  test('flags non-camelCase identifier', () => {
    const src = `const my_variable = 1;`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { camelCase: true });
    const ccIssues = issues.filter(i => i.rule === 'camel-case');
    assert.ok(ccIssues.length >= 1);
    assert.equal(ccIssues[0].message.includes('my_variable'), true);
  });

  test('allows camelCase, PascalCase, SCREAMING_SNAKE', () => {
    const src = `
const myVariable = 1;
class MyClass {}
const MAX_RETRIES = 5;
const _privateVar = true;
`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { camelCase: true });
    const ccIssues = issues.filter(i => i.rule === 'camel-case');
    assert.equal(ccIssues.length, 0);
  });

  test('no issues in clean code', () => {
    const src = `const x = 1;\nconst y = 2;\n`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, {
      noVar: true, noConsole: true, noDebugger: true,
      noTrailingWhitespace: true, maxLineLength: 120,
    });
    assert.equal(issues.length, 0);
  });

  test('can disable rules', () => {
    const src = `var x = 1;`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { noVar: false });
    const varIssues = issues.filter(i => i.rule === 'no-var');
    assert.equal(varIssues.length, 0);
  });

  test('issues sorted by line then col', () => {
    const src = `var a = 1;\nvar b = 2;\nvar c = 3;`;
    const tokens = tokenize(src);
    const issues = checkStyle(src, tokens, { noVar: true });
    const varIssues = issues.filter(i => i.rule === 'no-var');
    assert.equal(varIssues.length, 3);
    assert.equal(varIssues[0].line, 1);
    assert.equal(varIssues[1].line, 2);
    assert.equal(varIssues[2].line, 3);
  });
});

// ══════════════════════════════════════════════════════════════
//  DEPENDENCY MAPPER TESTS
// ══════════════════════════════════════════════════════════════

describe('Dependency Mapper', () => {
  test('parses ESM imports', () => {
    const src = `import { foo } from './foo.js';\nimport bar from './bar.js';`;
    const tokens = tokenize(src);
    const { imports } = parseImports(tokens, 'main.js');
    assert.equal(imports.length, 2);
    assert.equal(imports[0].source, './foo.js');
    assert.equal(imports[0].kind, 'import');
    assert.equal(imports[1].source, './bar.js');
  });

  test('parses wildcard import', () => {
    const src = `import * as ns from './utils.js';`;
    const tokens = tokenize(src);
    const { imports } = parseImports(tokens, 'main.js');
    assert.equal(imports.length, 1);
    assert.equal(imports[0].source, './utils.js');
  });

  test('parses require()', () => {
    const src = `const fs = require('fs');\nconst path = require('node:path');`;
    const tokens = tokenize(src);
    const { imports } = parseImports(tokens, 'main.js');
    assert.equal(imports.length, 2);
    assert.equal(imports[0].kind, 'require');
    assert.equal(imports[0].source, 'fs');
  });

  test('parses export ... from', () => {
    const src = `export { foo } from './foo.js';`;
    const tokens = tokenize(src);
    const { imports } = parseImports(tokens, 'main.js');
    assert.equal(imports.length, 1);
    assert.equal(imports[0].kind, 'export-from');
  });

  test('parses dynamic import', () => {
    const src = `const mod = await import('./plugin.js');`;
    const tokens = tokenize(src);
    const { imports } = parseImports(tokens, 'main.js');
    assert.equal(imports.length, 1);
    assert.equal(imports[0].kind, 'dynamic-import');
  });

  test('builds adjacency graph', () => {
    const files = [
      { file: 'a.js', tokens: tokenize(`import { b } from './b.js';`) },
      { file: 'b.js', tokens: tokenize(`import { c } from './c.js';`) },
      { file: 'c.js', tokens: tokenize(`export const x = 1;`) },
    ];
    // parseImports for each
    const fileData = files.map(f => ({ ...parseImports(f.tokens, f.file) }));
    const graph = buildGraph(fileData);
    assert.ok(graph.has('a.js'));
    assert.ok(graph.has('b.js'));
  });

  test('detects circular dependency', () => {
    const files = [
      { file: 'a.js', tokens: tokenize(`import x from './b.js';`) },
      { file: 'b.js', tokens: tokenize(`import y from './c.js';`) },
      { file: 'c.js', tokens: tokenize(`import z from './a.js';`) },
    ];
    const fileData = files.map(f => parseImports(f.tokens, f.file));
    const graph = buildGraph(fileData);
    const cycles = detectCircularDeps(graph);
    assert.ok(cycles.length > 0, 'Should detect circular dependency a→b→c→a');
  });

  test('no cycles in acyclic graph', () => {
    const files = [
      { file: 'a.js', tokens: tokenize(`import x from './b.js';`) },
      { file: 'b.js', tokens: tokenize(`import y from './c.js';`) },
      { file: 'c.js', tokens: tokenize(`export const x = 1;`) },
    ];
    const fileData = files.map(f => parseImports(f.tokens, f.file));
    const graph = buildGraph(fileData);
    const cycles = detectCircularDeps(graph);
    assert.equal(cycles.length, 0);
  });

  test('handles no imports', () => {
    const src = `export const x = 42;`;
    const tokens = tokenize(src);
    const { imports } = parseImports(tokens, 'x.js');
    assert.equal(imports.length, 0);
  });

  test('reports import line numbers', () => {
    const src = `\nimport foo from './foo.js';\nimport bar from './bar.js';`;
    const tokens = tokenize(src);
    const { imports } = parseImports(tokens, 'main.js');
    assert.equal(imports[0].line, 2);
    assert.equal(imports[1].line, 3);
  });
});

// ══════════════════════════════════════════════════════════════
//  FULL ANALYZER INTEGRATION TESTS
// ══════════════════════════════════════════════════════════════

describe('Full Analyzer (index.js)', () => {
  test('analyze() returns all sections', () => {
    const src = `
function simple(x) {
  if (x > 0) return x;
  return -x;
}`;
    const result = analyze(src, { file: 'test.js' });
    assert.ok(result.tokens.length > 0);
    assert.ok(result.complexity.length > 0);
    assert.ok(Array.isArray(result.deadCode));
    assert.ok(Array.isArray(result.style));
    assert.ok(result.summary);
    assert.equal(result.file, 'test.js');
  });

  test('summary statistics are correct', () => {
    const src = `
function a() { if (x) return 1; return 2; }
function b() { return 3; }
`;
    const result = analyze(src);
    assert.equal(result.summary.functions, 2);
    assert.ok(result.summary.avgComplexity > 0);
    assert.ok(result.summary.maxComplexity >= 2);
  });

  test('detects var in own codebase fixture', () => {
    const src = `var x = 1;\nvar y = 2;\nconst z = 3;`;
    const result = analyze(src, { rules: { noVar: true } });
    const varIssues = result.style.filter(i => i.rule === 'no-var');
    assert.equal(varIssues.length, 2);
  });

  test('detects dead code + style issues together', () => {
    const src = `function f() {\n  var x = 1;\n  return x;\n  console.log('dead');\n}`;
    const result = analyze(src, { rules: { noVar: true, noConsole: true } });
    assert.ok(result.deadCode.length >= 1);
    const varIssues = result.style.filter(i => i.rule === 'no-var');
    assert.ok(varIssues.length >= 1);
  });

  test('skip options work', () => {
    const src = `function f() { return 1; }`;
    const result = analyze(src, {
      skipComplexity: true,
      skipDeadCode: true,
      skipStyle: true,
      skipDependencies: true,
    });
    assert.deepEqual(result.complexity, []);
    assert.deepEqual(result.deadCode, []);
    assert.deepEqual(result.style, []);
    assert.equal(result.dependencies, null);
  });

  test('throws on non-string source', () => {
    assert.throws(() => analyze(42), /TypeError/);
  });
});

// ══════════════════════════════════════════════════════════════
//  REPORTER TESTS
// ══════════════════════════════════════════════════════════════

describe('Reporter', () => {
  test('toJSON produces valid JSON', () => {
    const src = `function f() { if (x) return 1; }`;
    const result = analyze(src, { file: 'test.js' });
    const json = toJSON(result);
    assert.doesNotThrow(() => JSON.parse(json));
    const parsed = JSON.parse(json);
    assert.equal(parsed.file, 'test.js');
  });

  test('toJSON includes all sections', () => {
    const src = `const x = 1;`;
    const result = analyze(src, { file: 'x.js' });
    const parsed = JSON.parse(toJSON(result));
    assert.ok('complexity' in parsed);
    assert.ok('deadCode' in parsed);
    assert.ok('style' in parsed);
    assert.ok('summary' in parsed);
  });

  test('toHuman returns non-empty string', () => {
    const src = `function f() { return 1; }`;
    const result = analyze(src, { file: 'f.js' });
    const human = toHuman(result, { noColor: true });
    assert.ok(human.length > 0);
    assert.ok(human.includes('f.js'));
  });

  test('toHuman noColor strips ANSI codes', () => {
    const src = `function f() { if (x) return 1; }`;
    const result = analyze(src, { file: 'f.js' });
    const human = toHuman(result, { noColor: true });
    // Should not contain ANSI escape sequences
    assert.ok(!/\x1b\[/.test(human));
  });

  test('toHuman shows complexity results', () => {
    const src = `function myFunc() { if (x) return 1; return 2; }`;
    const result = analyze(src);
    const human = toHuman(result, { noColor: true });
    assert.ok(human.includes('myFunc'));
  });

  test('toHuman shows dead code warnings', () => {
    const src = `function f() {\n  return 1;\n  const dead = 2;\n}`;
    const result = analyze(src);
    const human = toHuman(result, { noColor: true });
    assert.ok(human.toLowerCase().includes('dead') || human.toLowerCase().includes('unreachable'));
  });
});

// ══════════════════════════════════════════════════════════════
//  REAL-WORLD FIXTURE TESTS
// ══════════════════════════════════════════════════════════════

describe('Real-World Fixtures', () => {
  // Complex function with multiple branches — high complexity
  test('detects high complexity in complex function', () => {
    const src = `
function processData(data, opts) {
  if (!data) return null;
  if (opts && opts.strict) {
    if (data.length === 0) throw new Error('empty');
    if (!Array.isArray(data)) throw new TypeError('not array');
  }
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item.active && item.value > 0) {
      result.push(item.value);
    } else if (item.active || item.fallback) {
      result.push(item.fallback ?? 0);
    }
  }
  return result.length > 0 ? result : null;
}`;
    const tokens = tokenize(src);
    const fns = analyzeComplexity(tokens);
    const fn = fns.find(f => f.name === 'processData');
    assert.ok(fn, 'processData should be found');
    assert.ok(fn.complexity >= 8, `Expected complexity >= 8, got ${fn.complexity}`);
  });

  // Multiple dead code scenarios
  test('handles multiple dead code instances', () => {
    const src = `
function f(x) {
  if (x > 0) {
    return x;
    const dead1 = 1;
  }
  return -x;
}`;
    const tokens = tokenize(src);
    const issues = detectDeadCode(tokens, src.split('\n'));
    assert.ok(issues.length >= 1);
  });

  // Fixture: retry.js-like code
  test('analyzes retry-like async code correctly', () => {
    const src = `
export async function retry(fn, opts = {}) {
  const { retries = 3, delay = 100, factor = 2 } = opts;
  if (typeof fn !== 'function') throw new TypeError('fn must be a function');
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
    }
  }
  throw lastError;
}`;
    const result = analyze(src, { file: 'retry.js' });
    assert.ok(result.complexity.length > 0);
    // retry function should have significant complexity
    assert.ok(result.summary.maxComplexity >= 4);
  });

  // No-deps pure-ESM module
  test('handles ESM module with multiple exports', () => {
    const src = `
import { foo } from './foo.js';
import { bar } from './bar.js';

export function a() { return foo(); }
export function b() { return bar(); }
export default { a, b };
`;
    const result = analyze(src, { file: 'main.js' });
    assert.equal(result.dependencies.imports.length, 2);
    assert.equal(result.complexity.length, 2);
  });

  // Template literal edge case
  test('handles complex template literals in analysis', () => {
    const src = 'const msg = `Hello ${user.name}, you have ${count > 0 ? count : "no"} messages`;';
    const tokens = tokenize(src);
    const tmpl = tokens.filter(t => t.type === 'template');
    assert.equal(tmpl.length, 1);
  });
});
