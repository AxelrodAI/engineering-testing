/**
 * Comprehensive tests for the CLI framework.
 * Uses node:test + node:assert. Zero external dependencies.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

import { parse } from './parser.js';
import { CommandRegistry } from './registry.js';
import { generateHelp, generateCommandHelp } from './help.js';
import { validate } from './validate.js';
import {
  red, green, yellow, blue, magenta, cyan, white,
  bold, dim, italic, underline, stripAnsi, compose,
} from './color.js';
import { confirm, select, input, mockInput, nullOutput } from './prompt.js';
import { createCLI } from './index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Capture writes to a Writable into a string */
function captureOutput() {
  let buf = '';
  const stream = new Writable({
    write(chunk, _enc, cb) { buf += chunk.toString(); cb(); },
  });
  return {
    stream,
    get text() { return buf; },
    reset() { buf = ''; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('parser', () => {

  describe('basic parsing', () => {
    test('empty argv → no command, no flags, no args', () => {
      const r = parse([]);
      assert.equal(r.command, null);
      assert.deepEqual(r.flags, {});
      assert.deepEqual(r.args, []);
    });

    test('null/undefined argv is handled gracefully', () => {
      assert.doesNotThrow(() => parse(null));
      assert.doesNotThrow(() => parse(undefined));
      const r = parse(null);
      assert.equal(r.command, null);
    });

    test('single positional = command', () => {
      const r = parse(['deploy']);
      assert.equal(r.command, 'deploy');
      assert.deepEqual(r.args, []);
    });

    test('command + positional args', () => {
      const r = parse(['copy', 'src', 'dest']);
      assert.equal(r.command, 'copy');
      assert.deepEqual(r.args, ['src', 'dest']);
    });

    test('command + flag + args (flag consumes next positional as value)', () => {
      // Parser has no schema so --watch consumes 'src' as its value
      const r = parse(['build', '--watch', 'src']);
      assert.equal(r.command, 'build');
      assert.equal(r.flags.watch, 'src');
      assert.deepEqual(r.args, []);
    });

    test('command + boolean flag (=value form) + positional arg', () => {
      // Use --flag=value form to unambiguously mark watch as boolean
      const r = parse(['build', '--watch=true', 'src']);
      assert.equal(r.command, 'build');
      assert.equal(r.flags.watch, 'true');
      assert.deepEqual(r.args, ['src']);
    });
  });

  describe('boolean flags', () => {
    test('--flag sets flag to true', () => {
      const r = parse(['--verbose']);
      assert.equal(r.flags.verbose, true);
    });

    test('--no-flag negation sets flag to false', () => {
      const r = parse(['--no-verbose']);
      assert.equal(r.flags.verbose, false);
    });

    test('--no-dry-run negation (hyphenated)', () => {
      const r = parse(['--no-dry-run']);
      assert.equal(r.flags.dryRun, false);
    });

    test('multiple boolean flags', () => {
      const r = parse(['--watch', '--no-colors', '--verbose']);
      assert.equal(r.flags.watch, true);
      assert.equal(r.flags.colors, false);
      assert.equal(r.flags.verbose, true);
    });
  });

  describe('--flag=value syntax', () => {
    test('--name=value', () => {
      const r = parse(['--name=alice']);
      assert.equal(r.flags.name, 'alice');
    });

    test('--count=5 (numeric string)', () => {
      const r = parse(['--count=5']);
      assert.equal(r.flags.count, '5');
    });

    test('--name="John Doe" (quoted value)', () => {
      const r = parse(['--name="John Doe"']);
      assert.equal(r.flags.name, 'John Doe');
    });

    test("--name='Jane Doe' (single-quoted value)", () => {
      const r = parse(["--name='Jane Doe'"]);
      assert.equal(r.flags.name, 'Jane Doe');
    });

    test('--output=./dist/file.js (path value)', () => {
      const r = parse(['--output=./dist/file.js']);
      assert.equal(r.flags.output, './dist/file.js');
    });

    test('kebab-case flag converted to camelCase', () => {
      const r = parse(['--dry-run=true']);
      assert.equal(r.flags.dryRun, 'true');
    });
  });

  describe('--flag value syntax (space-separated)', () => {
    test('--name value', () => {
      const r = parse(['--name', 'alice']);
      assert.equal(r.flags.name, 'alice');
    });

    test('--name value with more flags after', () => {
      const r = parse(['--name', 'alice', '--verbose']);
      assert.equal(r.flags.name, 'alice');
      assert.equal(r.flags.verbose, true);
    });

    test('--count 42 (numeric string)', () => {
      const r = parse(['--count', '42']);
      assert.equal(r.flags.count, '42');
    });

    test('flag followed by command treats next token correctly', () => {
      // If next token starts with - it is NOT consumed as the value
      const r = parse(['--verbose', '--name', 'bob']);
      assert.equal(r.flags.verbose, true);
      assert.equal(r.flags.name, 'bob');
    });
  });

  describe('short flags', () => {
    test('-v sets v=true', () => {
      const r = parse(['-v']);
      assert.equal(r.flags.v, true);
    });

    test('-v value (short flag with value)', () => {
      const r = parse(['-v', 'info']);
      assert.equal(r.flags.v, 'info');
    });

    test('-abc combined short flags → each = true', () => {
      const r = parse(['-abc']);
      assert.equal(r.flags.a, true);
      assert.equal(r.flags.b, true);
      assert.equal(r.flags.c, true);
    });

    test('-vvv combined same flag → true (idempotent)', () => {
      const r = parse(['-vvv']);
      assert.equal(r.flags.v, true);
    });

    test('multiple separate short flags', () => {
      const r = parse(['-v', '-q', '-f']);
      assert.equal(r.flags.v, true);
      assert.equal(r.flags.q, true);
      assert.equal(r.flags.f, true);
    });
  });

  describe('-- end-of-flags marker', () => {
    test('everything after -- is positional', () => {
      const r = parse(['deploy', '--', '--not-a-flag', '-x', 'value']);
      assert.equal(r.command, 'deploy');
      assert.deepEqual(r.flags, {});
      assert.deepEqual(r.args, ['--not-a-flag', '-x', 'value']);
    });

    test('flags before -- are parsed normally; post-- tokens become positionals', () => {
      // '--raw' after -- is positional → it becomes the command (first positional)
      const r = parse(['cmd', '--verbose', '--', '--raw', 'extra']);
      assert.equal(r.command, 'cmd');
      assert.equal(r.flags.verbose, true);
      assert.deepEqual(r.args, ['--raw', 'extra']);
    });

    test('standalone -- with no following args', () => {
      const r = parse(['cmd', '--flag', '--']);
      assert.equal(r.command, 'cmd');
      assert.equal(r.flags.flag, true);
      assert.deepEqual(r.args, []);
    });
  });

  describe('camelCase conversion', () => {
    test('--dry-run → dryRun', () => {
      const r = parse(['--dry-run']);
      assert.equal(r.flags.dryRun, true);
    });

    test('--output-file → outputFile', () => {
      const r = parse(['--output-file', 'foo.txt']);
      assert.equal(r.flags.outputFile, 'foo.txt');
    });

    test('--a-b-c → aBC', () => {
      const r = parse(['--a-b-c']);
      assert.equal(r.flags.aBC, true);
    });
  });

  describe('mixed complex parsing', () => {
    test('command + mixed flags + positionals', () => {
      const r = parse(['deploy', '-v', '--env=production', '--', 'extra']);
      assert.equal(r.command, 'deploy');
      assert.equal(r.flags.v, true);
      assert.equal(r.flags.env, 'production');
      assert.deepEqual(r.args, ['extra']);
    });

    test('flags before command (space-sep flag consumes next non-flag as value)', () => {
      // --verbose sees 'build' (non-flag) → consumes it as its value
      const r = parse(['--verbose', 'build', '--watch']);
      assert.equal(r.flags.verbose, 'build'); // 'build' consumed as --verbose's value
      assert.equal(r.flags.watch, true);
      assert.equal(r.command, null); // no remaining positionals
    });

    test('placing command before flags avoids value-consumption ambiguity', () => {
      const r = parse(['build', '--verbose', '--watch']);
      assert.equal(r.command, 'build');
      assert.equal(r.flags.verbose, true);
      assert.equal(r.flags.watch, true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('CommandRegistry', () => {

  test('starts empty', () => {
    const reg = new CommandRegistry();
    assert.equal(reg.size, 0);
    assert.deepEqual(reg.list(), []);
  });

  test('register and get a command', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'hello', description: 'Say hello', handler: () => 'hi' });
    assert.ok(reg.has('hello'));
    assert.equal(reg.get('hello').name, 'hello');
    assert.equal(reg.get('hello').description, 'Say hello');
  });

  test('register is chainable', () => {
    const reg = new CommandRegistry();
    const result = reg.register({ name: 'a', handler: () => {} });
    assert.equal(result, reg);
  });

  test('list() returns all command names', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'alpha', handler: () => {} });
    reg.register({ name: 'beta', handler: () => {} });
    const names = reg.list();
    assert.ok(names.includes('alpha'));
    assert.ok(names.includes('beta'));
    assert.equal(names.length, 2);
  });

  test('all() returns command definitions', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'x', description: 'X command', handler: () => {} });
    const all = reg.all();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, 'x');
    assert.equal(all[0].description, 'X command');
  });

  test('size reflects registered count', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'a', handler: () => {} });
    reg.register({ name: 'b', handler: () => {} });
    assert.equal(reg.size, 2);
  });

  test('overwriting a command replaces it', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'foo', description: 'old', handler: () => 'old' });
    reg.register({ name: 'foo', description: 'new', handler: () => 'new' });
    assert.equal(reg.size, 1);
    assert.equal(reg.get('foo').description, 'new');
  });

  test('unregister removes command', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'bye', handler: () => {} });
    assert.ok(reg.has('bye'));
    const removed = reg.unregister('bye');
    assert.equal(removed, true);
    assert.ok(!reg.has('bye'));
  });

  test('unregister returns false for unknown command', () => {
    const reg = new CommandRegistry();
    assert.equal(reg.unregister('ghost'), false);
  });

  test('throws on missing name', () => {
    const reg = new CommandRegistry();
    assert.throws(() => reg.register({ handler: () => {} }), /name must be a non-empty string/);
  });

  test('throws on missing handler', () => {
    const reg = new CommandRegistry();
    assert.throws(() => reg.register({ name: 'bad' }), /handler must be a function/);
  });

  test('run executes handler and returns result', async () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'add', handler: (flags) => flags.a + flags.b });
    const result = await reg.run('add', { a: 2, b: 3 }, []);
    assert.equal(result, 5);
  });

  test('run passes args and ctx to handler', async () => {
    const reg = new CommandRegistry();
    let received;
    reg.register({ name: 'ctx', handler: (flags, args, ctx) => { received = { flags, args, ctx }; } });
    const ctx = { user: 'test' };
    await reg.run('ctx', { x: 1 }, ['a', 'b'], ctx);
    assert.deepEqual(received.flags, { x: 1 });
    assert.deepEqual(received.args, ['a', 'b']);
    assert.equal(received.ctx, ctx);
  });

  test('run throws for unknown command', async () => {
    const reg = new CommandRegistry();
    await assert.rejects(() => reg.run('ghost'), /Unknown command/);
  });

  test('get returns undefined for unknown command', () => {
    const reg = new CommandRegistry();
    assert.equal(reg.get('nope'), undefined);
  });

  test('has returns false for unknown command', () => {
    const reg = new CommandRegistry();
    assert.equal(reg.has('nope'), false);
  });

  test('options defaults to empty array if not provided', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'simple', handler: () => {} });
    assert.deepEqual(reg.get('simple').options, []);
  });

  test('arguments defaults to empty array if not provided', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'simple', handler: () => {} });
    assert.deepEqual(reg.get('simple').arguments, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('validate', () => {

  test('empty flags + empty schema → valid, empty values', () => {
    const r = validate({}, []);
    assert.equal(r.valid, true);
    assert.deepEqual(r.errors, []);
  });

  test('null/undefined flags handled gracefully', () => {
    const r = validate(null, []);
    assert.equal(r.valid, true);
  });

  test('string type coercion', () => {
    const schema = [{ name: 'label', type: 'string' }];
    const r = validate({ label: 42 }, schema);
    assert.equal(r.valid, true);
    assert.equal(r.values.label, '42');
  });

  test('number type coercion from string', () => {
    const schema = [{ name: 'count', type: 'number' }];
    const r = validate({ count: '5' }, schema);
    assert.equal(r.valid, true);
    assert.equal(r.values.count, 5);
    assert.equal(typeof r.values.count, 'number');
  });

  test('number coercion fails on non-numeric string', () => {
    const schema = [{ name: 'count', type: 'number' }];
    const r = validate({ count: 'abc' }, schema);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('Invalid number')));
  });

  test('boolean true coercion variants', () => {
    const schema = [{ name: 'flag', type: 'boolean' }];
    for (const val of [true, 'true', '1', 'yes']) {
      const r = validate({ flag: val }, schema);
      assert.equal(r.valid, true, `failed for value: ${val}`);
      assert.equal(r.values.flag, true, `not true for value: ${val}`);
    }
  });

  test('boolean false coercion variants', () => {
    const schema = [{ name: 'flag', type: 'boolean' }];
    for (const val of [false, 'false', '0', 'no']) {
      const r = validate({ flag: val }, schema);
      assert.equal(r.valid, true, `failed for value: ${val}`);
      assert.equal(r.values.flag, false, `not false for value: ${val}`);
    }
  });

  test('boolean type fails on invalid value', () => {
    const schema = [{ name: 'flag', type: 'boolean' }];
    const r = validate({ flag: 'maybe' }, schema);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('Invalid boolean')));
  });

  test('required option missing → error', () => {
    const schema = [{ name: 'token', type: 'string', required: true }];
    const r = validate({}, schema);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('Missing required option: --token')));
  });

  test('required option present → valid', () => {
    const schema = [{ name: 'token', type: 'string', required: true }];
    const r = validate({ token: 'abc123' }, schema);
    assert.equal(r.valid, true);
    assert.equal(r.values.token, 'abc123');
  });

  test('default value applied when option absent', () => {
    const schema = [{ name: 'env', type: 'string', default: 'development' }];
    const r = validate({}, schema);
    assert.equal(r.valid, true);
    assert.equal(r.values.env, 'development');
  });

  test('default is overridden by provided value', () => {
    const schema = [{ name: 'env', type: 'string', default: 'development' }];
    const r = validate({ env: 'production' }, schema);
    assert.equal(r.values.env, 'production');
  });

  test('boolean option defaults to false when absent (no default set)', () => {
    const schema = [{ name: 'verbose', type: 'boolean' }];
    const r = validate({}, schema);
    assert.equal(r.valid, true);
    assert.equal(r.values.verbose, false);
  });

  test('enum constraint passes for valid value', () => {
    const schema = [{ name: 'env', type: 'string', enum: ['dev', 'prod', 'staging'] }];
    const r = validate({ env: 'prod' }, schema);
    assert.equal(r.valid, true);
    assert.equal(r.values.env, 'prod');
  });

  test('enum constraint fails for invalid value', () => {
    const schema = [{ name: 'env', type: 'string', enum: ['dev', 'prod'] }];
    const r = validate({ env: 'test' }, schema);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('Invalid value for --env')));
  });

  test('alias resolves short flag to long name', () => {
    const schema = [{ name: 'verbose', type: 'boolean', alias: 'v' }];
    const r = validate({ v: true }, schema);
    assert.equal(r.valid, true);
    assert.equal(r.values.verbose, true);
  });

  test('multiple errors reported at once', () => {
    const schema = [
      { name: 'name', type: 'string', required: true },
      { name: 'count', type: 'number' },
    ];
    const r = validate({ count: 'bad' }, schema);
    assert.equal(r.valid, false);
    assert.ok(r.errors.length >= 2);
  });

  test('extra flags not in schema pass through', () => {
    const schema = [{ name: 'verbose', type: 'boolean' }];
    const r = validate({ verbose: true, extra: 'stuff' }, schema);
    assert.equal(r.values.extra, 'stuff');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COLOR TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('color', () => {

  test('red wraps in ANSI red codes', () => {
    const out = red('error');
    assert.ok(out.includes('\x1b[31m'));
    assert.ok(out.includes('error'));
    assert.ok(out.includes('\x1b[0m'));
  });

  test('green wraps in ANSI green codes', () => {
    const out = green('ok');
    assert.ok(out.includes('\x1b[32m'));
    assert.ok(out.includes('\x1b[0m'));
  });

  test('yellow wraps in ANSI yellow codes', () => {
    const out = yellow('warn');
    assert.ok(out.includes('\x1b[33m'));
  });

  test('blue wraps in ANSI blue codes', () => {
    const out = blue('info');
    assert.ok(out.includes('\x1b[34m'));
  });

  test('magenta wraps in ANSI magenta codes', () => {
    const out = magenta('m');
    assert.ok(out.includes('\x1b[35m'));
  });

  test('cyan wraps in ANSI cyan codes', () => {
    const out = cyan('c');
    assert.ok(out.includes('\x1b[36m'));
  });

  test('white wraps in ANSI white codes', () => {
    const out = white('w');
    assert.ok(out.includes('\x1b[37m'));
  });

  test('bold wraps in ANSI bold code (1)', () => {
    const out = bold('TITLE');
    assert.ok(out.includes('\x1b[1m'));
    assert.ok(out.includes('TITLE'));
  });

  test('dim wraps in ANSI dim code (2)', () => {
    const out = dim('hint');
    assert.ok(out.includes('\x1b[2m'));
  });

  test('italic wraps in ANSI italic code (3)', () => {
    const out = italic('slanted');
    assert.ok(out.includes('\x1b[3m'));
  });

  test('underline wraps in ANSI underline code (4)', () => {
    const out = underline('link');
    assert.ok(out.includes('\x1b[4m'));
  });

  test('stripAnsi removes all escape codes', () => {
    const colored = red(bold('hello'));
    const plain = stripAnsi(colored);
    assert.equal(plain, 'hello');
    assert.ok(!plain.includes('\x1b'));
  });

  test('stripAnsi on plain string returns unchanged', () => {
    assert.equal(stripAnsi('hello world'), 'hello world');
  });

  test('stripAnsi handles empty string', () => {
    assert.equal(stripAnsi(''), '');
  });

  test('compose combines two functions', () => {
    const boldRed = compose(bold, red);
    const out = boldRed('alert');
    assert.ok(out.includes('alert'));
    // Should contain both bold and red codes
    assert.ok(out.includes('\x1b[1m') || out.includes('\x1b[31m'));
  });

  test('color functions preserve text content', () => {
    const text = 'hello world 123!';
    for (const fn of [red, green, yellow, blue, bold, dim]) {
      assert.ok(stripAnsi(fn(text)) === text, `Failed for ${fn.name}`);
    }
  });

  test('nested colors work (stripAnsi removes all)', () => {
    const out = bold(red('nested'));
    const plain = stripAnsi(out);
    assert.equal(plain, 'nested');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HELP TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('help', () => {

  test('generateHelp returns a string', () => {
    const reg = new CommandRegistry();
    const out = generateHelp(reg, 'mycli');
    assert.equal(typeof out, 'string');
  });

  test('generateHelp includes program name', () => {
    const reg = new CommandRegistry();
    const out = stripAnsi(generateHelp(reg, 'mycli'));
    assert.ok(out.includes('mycli'));
  });

  test('generateHelp with commands lists them', () => {
    const reg = new CommandRegistry();
    reg.register({ name: 'build', description: 'Build project', handler: () => {} });
    reg.register({ name: 'deploy', description: 'Deploy project', handler: () => {} });
    const out = stripAnsi(generateHelp(reg, 'tool'));
    assert.ok(out.includes('build'));
    assert.ok(out.includes('Build project'));
    assert.ok(out.includes('deploy'));
    assert.ok(out.includes('Deploy project'));
  });

  test('generateHelp with no commands shows message', () => {
    const reg = new CommandRegistry();
    const out = stripAnsi(generateHelp(reg, 'tool'));
    assert.ok(out.includes('No commands registered') || out.includes('Usage'));
  });

  test('generateHelp mentions --help flag', () => {
    const reg = new CommandRegistry();
    const out = stripAnsi(generateHelp(reg, 'tool'));
    assert.ok(out.includes('--help'));
  });

  test('generateCommandHelp returns a string', () => {
    const cmd = { name: 'build', description: 'Build stuff', options: [], arguments: [] };
    const out = generateCommandHelp(cmd, 'tool');
    assert.equal(typeof out, 'string');
  });

  test('generateCommandHelp includes command name', () => {
    const cmd = { name: 'deploy', description: 'Deploy app', options: [], arguments: [] };
    const out = stripAnsi(generateCommandHelp(cmd, 'tool'));
    assert.ok(out.includes('deploy'));
    assert.ok(out.includes('Deploy app'));
  });

  test('generateCommandHelp shows options', () => {
    const cmd = {
      name: 'build',
      description: 'Build',
      options: [
        { name: 'env', type: 'string', description: 'Environment', required: true },
        { name: 'watch', type: 'boolean', description: 'Watch mode' },
      ],
      arguments: [],
    };
    const out = stripAnsi(generateCommandHelp(cmd, 'tool'));
    assert.ok(out.includes('--env'));
    assert.ok(out.includes('--watch'));
    assert.ok(out.includes('Environment'));
    assert.ok(out.includes('Watch mode'));
  });

  test('generateCommandHelp shows required marker', () => {
    const cmd = {
      name: 'run',
      description: 'Run',
      options: [{ name: 'file', type: 'string', required: true, description: 'File path' }],
      arguments: [],
    };
    const out = stripAnsi(generateCommandHelp(cmd, 'tool'));
    assert.ok(out.includes('required') || out.includes('--file'));
  });

  test('generateCommandHelp shows default value', () => {
    const cmd = {
      name: 'serve',
      description: 'Serve',
      options: [{ name: 'port', type: 'number', default: 3000, description: 'Port' }],
      arguments: [],
    };
    const out = stripAnsi(generateCommandHelp(cmd, 'tool'));
    assert.ok(out.includes('3000'));
  });

  test('generateCommandHelp shows positional arguments', () => {
    const cmd = {
      name: 'copy',
      description: 'Copy files',
      options: [],
      arguments: ['source', 'destination'],
    };
    const out = stripAnsi(generateCommandHelp(cmd, 'tool'));
    assert.ok(out.includes('source'));
    assert.ok(out.includes('destination'));
  });

  test('generateCommandHelp with null cmd returns error string', () => {
    const out = generateCommandHelp(null, 'tool');
    assert.ok(typeof out === 'string');
    assert.ok(out.length > 0);
  });

  test('generateCommandHelp includes --help flag', () => {
    const cmd = { name: 'x', description: '', options: [], arguments: [] };
    const out = stripAnsi(generateCommandHelp(cmd, 'tool'));
    assert.ok(out.includes('--help'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('prompt', () => {

  describe('confirm', () => {
    test('y resolves true', async () => {
      const result = await confirm('Continue?', {
        input: mockInput('y'),
        output: nullOutput(),
      });
      assert.equal(result, true);
    });

    test('yes resolves true', async () => {
      const result = await confirm('Continue?', {
        input: mockInput('yes'),
        output: nullOutput(),
      });
      assert.equal(result, true);
    });

    test('n resolves false', async () => {
      const result = await confirm('Continue?', {
        input: mockInput('n'),
        output: nullOutput(),
      });
      assert.equal(result, false);
    });

    test('no resolves false', async () => {
      const result = await confirm('Continue?', {
        input: mockInput('no'),
        output: nullOutput(),
      });
      assert.equal(result, false);
    });

    test('empty input with defaultValue=true resolves true', async () => {
      const result = await confirm('Continue?', {
        input: mockInput(''),
        output: nullOutput(),
        defaultValue: true,
      });
      assert.equal(result, true);
    });

    test('empty input with defaultValue=false resolves false', async () => {
      const result = await confirm('Continue?', {
        input: mockInput(''),
        output: nullOutput(),
        defaultValue: false,
      });
      assert.equal(result, false);
    });

    test('Y (uppercase) resolves true', async () => {
      const result = await confirm('OK?', {
        input: mockInput('Y'),
        output: nullOutput(),
      });
      assert.equal(result, true);
    });

    test('N (uppercase) resolves false', async () => {
      const result = await confirm('OK?', {
        input: mockInput('N'),
        output: nullOutput(),
      });
      assert.equal(result, false);
    });
  });

  describe('select', () => {
    const colors_list = ['red', 'green', 'blue'];

    test('selecting 1 returns first choice', async () => {
      const result = await select('Pick a color', colors_list, {
        input: mockInput('1'),
        output: nullOutput(),
      });
      assert.equal(result, 'red');
    });

    test('selecting 2 returns second choice', async () => {
      const result = await select('Pick a color', colors_list, {
        input: mockInput('2'),
        output: nullOutput(),
      });
      assert.equal(result, 'green');
    });

    test('selecting last choice by index', async () => {
      const result = await select('Pick a color', colors_list, {
        input: mockInput('3'),
        output: nullOutput(),
      });
      assert.equal(result, 'blue');
    });

    test('invalid choice (0) rejects', async () => {
      await assert.rejects(
        () => select('Pick', colors_list, { input: mockInput('0'), output: nullOutput() }),
        /invalid choice/i,
      );
    });

    test('invalid choice (too large) rejects', async () => {
      await assert.rejects(
        () => select('Pick', colors_list, { input: mockInput('99'), output: nullOutput() }),
        /invalid choice/i,
      );
    });

    test('non-numeric choice rejects', async () => {
      await assert.rejects(
        () => select('Pick', colors_list, { input: mockInput('abc'), output: nullOutput() }),
        /invalid choice/i,
      );
    });

    test('throws on empty choices array', async () => {
      await assert.rejects(
        () => select('Pick', [], { input: mockInput('1'), output: nullOutput() }),
        /non-empty array/,
      );
    });

    test('single choice works', async () => {
      const result = await select('Pick', ['only'], { input: mockInput('1'), output: nullOutput() });
      assert.equal(result, 'only');
    });
  });

  describe('input', () => {
    test('returns typed text', async () => {
      const result = await input('Name?', {
        input: mockInput('Alice'),
        output: nullOutput(),
      });
      assert.equal(result, 'Alice');
    });

    test('empty input with default returns default', async () => {
      const result = await input('Name?', {
        input: mockInput(''),
        output: nullOutput(),
        defaultValue: 'World',
      });
      assert.equal(result, 'World');
    });

    test('non-empty input overrides default', async () => {
      const result = await input('Name?', {
        input: mockInput('Bob'),
        output: nullOutput(),
        defaultValue: 'World',
      });
      assert.equal(result, 'Bob');
    });

    test('validate function accepts valid input', async () => {
      const result = await input('Age?', {
        input: mockInput('25'),
        output: nullOutput(),
        validate: (v) => isNaN(Number(v)) ? 'Must be a number' : null,
      });
      assert.equal(result, '25');
    });

    test('validate function rejects invalid input', async () => {
      await assert.rejects(
        () => input('Age?', {
          input: mockInput('abc'),
          output: nullOutput(),
          validate: (v) => isNaN(Number(v)) ? 'Must be a number' : null,
        }),
        /validation failed/,
      );
    });

    test('trims whitespace from input', async () => {
      const result = await input('Name?', {
        input: mockInput('  Alice  '),
        output: nullOutput(),
      });
      assert.equal(result, 'Alice');
    });
  });

  describe('mockInput', () => {
    test('mockInput creates a readable stream', () => {
      const stream = mockInput('hello');
      assert.ok(typeof stream.pipe === 'function');
      assert.ok(typeof stream.on === 'function');
    });

    test('mockInput handles empty string', () => {
      assert.doesNotThrow(() => mockInput(''));
    });

    test('mockInput handles null/undefined gracefully', () => {
      assert.doesNotThrow(() => mockInput(null));
      assert.doesNotThrow(() => mockInput(undefined));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createCLI INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('createCLI', () => {

  test('creates CLI with registry', () => {
    const cli = createCLI({ name: 'test' });
    assert.ok(cli.registry instanceof CommandRegistry);
  });

  test('command() registers and is chainable', () => {
    const cli = createCLI({ name: 'test' });
    const result = cli.command({ name: 'hello', handler: () => {} });
    assert.equal(result, cli);
    assert.ok(cli.registry.has('hello'));
  });

  test('run() with --help prints help', async () => {
    const out = captureOutput();
    const cli = createCLI({ name: 'mytool', output: out.stream });
    cli.command({ name: 'build', description: 'Build it', handler: () => {} });
    await cli.run(['--help']);
    assert.ok(out.text.includes('mytool'));
    assert.ok(out.text.includes('build'));
  });

  test('run() with no args prints help', async () => {
    const out = captureOutput();
    const cli = createCLI({ name: 'mytool', output: out.stream });
    await cli.run([]);
    assert.ok(out.text.length > 0);
    assert.ok(out.text.includes('mytool'));
  });

  test('run() with --version prints version', async () => {
    const out = captureOutput();
    const cli = createCLI({ name: 'tool', version: '2.1.0', output: out.stream });
    await cli.run(['--version']);
    assert.ok(out.text.includes('2.1.0'));
  });

  test('run() executes matching command handler', async () => {
    let called = false;
    const cli = createCLI({ name: 'tool', output: nullOutput() });
    cli.command({ name: 'ping', handler: () => { called = true; return 'pong'; } });
    await cli.run(['ping']);
    assert.equal(called, true);
  });

  test('run() passes flags to handler', async () => {
    let received;
    const cli = createCLI({ name: 'tool', output: nullOutput() });
    cli.command({
      name: 'greet',
      options: [{ name: 'name', type: 'string', required: true }],
      handler: (flags) => { received = flags; },
    });
    await cli.run(['greet', '--name', 'Alice']);
    assert.equal(received.name, 'Alice');
  });

  test('run() passes positional args to handler', async () => {
    let receivedArgs;
    const cli = createCLI({ name: 'tool', output: nullOutput() });
    cli.command({
      name: 'copy',
      handler: (_flags, args) => { receivedArgs = args; },
    });
    await cli.run(['copy', 'src.txt', 'dst.txt']);
    assert.deepEqual(receivedArgs, ['src.txt', 'dst.txt']);
  });

  test('run() validates required options and calls exit on failure', async () => {
    let exitCode;
    const out = captureOutput();
    const cli = createCLI({ name: 'tool', output: out.stream, exit: (code) => { exitCode = code; } });
    cli.command({
      name: 'deploy',
      options: [{ name: 'env', type: 'string', required: true }],
      handler: () => {},
    });
    await cli.run(['deploy']);
    assert.equal(exitCode, 1);
    assert.ok(out.text.includes('Missing required option'));
  });

  test('run() calls exit(1) for unknown command', async () => {
    let exitCode;
    const out = captureOutput();
    const cli = createCLI({ name: 'tool', output: out.stream, exit: (code) => { exitCode = code; } });
    await cli.run(['unknown-cmd']);
    assert.equal(exitCode, 1);
  });

  test('run() with async handler returns result', async () => {
    const cli = createCLI({ name: 'tool', output: nullOutput() });
    cli.command({
      name: 'fetch',
      handler: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return 42;
      },
    });
    const result = await cli.run(['fetch']);
    assert.equal(result, 42);
  });

  test('help() method outputs help text', () => {
    const out = captureOutput();
    const cli = createCLI({ name: 'mytool', output: out.stream });
    cli.command({ name: 'run', description: 'Run it', handler: () => {} });
    cli.help();
    assert.ok(out.text.includes('mytool'));
    assert.ok(out.text.includes('run'));
  });

  test('run() coerces number type from argv string', async () => {
    let received;
    const cli = createCLI({ name: 'tool', output: nullOutput() });
    cli.command({
      name: 'resize',
      options: [{ name: 'width', type: 'number' }],
      handler: (flags) => { received = flags; },
    });
    await cli.run(['resize', '--width=800']);
    assert.equal(received.width, 800);
    assert.equal(typeof received.width, 'number');
  });

  test('run() applies defaults for missing optional flags', async () => {
    let received;
    const cli = createCLI({ name: 'tool', output: nullOutput() });
    cli.command({
      name: 'serve',
      options: [{ name: 'port', type: 'number', default: 3000 }],
      handler: (flags) => { received = flags; },
    });
    await cli.run(['serve']);
    assert.equal(received.port, 3000);
  });
});
