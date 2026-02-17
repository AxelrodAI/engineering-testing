// reporter.js — Colorized ANSI test reporter

const ANSI = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const c = {
  pass:    (s) => `${ANSI.green}${s}${ANSI.reset}`,
  fail:    (s) => `${ANSI.red}${s}${ANSI.reset}`,
  skip:    (s) => `${ANSI.yellow}${s}${ANSI.reset}`,
  suite:   (s) => `${ANSI.bold}${ANSI.white}${s}${ANSI.reset}`,
  dim:     (s) => `${ANSI.dim}${s}${ANSI.reset}`,
  bold:    (s) => `${ANSI.bold}${s}${ANSI.reset}`,
  cyan:    (s) => `${ANSI.cyan}${s}${ANSI.reset}`,
  gray:    (s) => `${ANSI.gray}${s}${ANSI.reset}`,
  red:     (s) => `${ANSI.red}${s}${ANSI.reset}`,
  green:   (s) => `${ANSI.green}${s}${ANSI.reset}`,
  yellow:  (s) => `${ANSI.yellow}${s}${ANSI.reset}`,
};

export class Reporter {
  #out;
  #failures = [];
  #startTime = null;

  constructor({ out = process.stdout } = {}) {
    this.#out = out;
  }

  write(s) {
    this.#out.write(s);
  }

  line(s = '') {
    this.#out.write(s + '\n');
  }

  onRunStart() {
    this.#startTime = Date.now();
    this.#failures = [];
  }

  onSuiteStart(suite) {
    const indent = '  '.repeat(suite.depth);
    this.line(`${indent}${c.suite(suite.name)}`);
  }

  onTestPass(test) {
    const indent = '  '.repeat(test.depth);
    this.line(`${indent}${c.pass('✓')} ${c.dim(test.name)}`);
  }

  onTestFail(test, error) {
    const indent = '  '.repeat(test.depth);
    this.line(`${indent}${c.fail('✗')} ${test.name}`);
    this.#failures.push({ test, error });
  }

  onTestSkip(test) {
    const indent = '  '.repeat(test.depth);
    this.line(`${indent}${c.skip('○')} ${c.dim(test.name)} ${c.gray('(skipped)')}`);
  }

  onRunEnd(stats) {
    const elapsed = Date.now() - this.#startTime;
    this.line('');

    // Print failure details
    if (this.#failures.length > 0) {
      this.line(c.bold(c.red('Failures:')));
      this.line('');
      this.#failures.forEach(({ test, error }, i) => {
        const fullName = test.fullName || test.name;
        this.line(`  ${c.red(`${i + 1})`)} ${c.bold(fullName)}`);
        this.line('');
        if (error.message) {
          this.line(`    ${c.red(error.message)}`);
        }
        if (error.stack) {
          const stackLines = error.stack
            .split('\n')
            .slice(1) // skip first line (message)
            .filter(l => l.trim())
            .slice(0, 5); // limit stack depth
          stackLines.forEach(l => this.line(`    ${c.gray(l.trim())}`));
        }
        this.line('');
      });
    }

    // Summary line
    const parts = [];
    if (stats.passed > 0)  parts.push(c.pass(`${stats.passed} passed`));
    if (stats.failed > 0)  parts.push(c.fail(`${stats.failed} failed`));
    if (stats.skipped > 0) parts.push(c.skip(`${stats.skipped} skipped`));

    this.line(c.bold('Test Summary:') + ' ' + parts.join(c.gray(', ')));
    this.line(c.gray(`Time: ${elapsed}ms`));

    const allPass = stats.failed === 0;
    this.line('');
    if (allPass) {
      this.line(c.pass(c.bold(`✓ All tests passed`)));
    } else {
      this.line(c.fail(c.bold(`✗ ${stats.failed} test${stats.failed !== 1 ? 's' : ''} failed`)));
    }
    this.line('');
  }
}
