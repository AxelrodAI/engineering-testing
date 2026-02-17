/**
 * Mini CLI Framework — public API and createCLI() factory.
 *
 * @module cli-framework
 */

'use strict';

export { parse } from './parser.js';
export { CommandRegistry } from './registry.js';
export { generateHelp, generateCommandHelp } from './help.js';
export { validate } from './validate.js';
export {
  red, green, yellow, blue, magenta, cyan, white,
  bold, dim, italic, underline, reset, stripAnsi, compose, colors,
} from './color.js';
export { confirm, select, input, mockInput, nullOutput } from './prompt.js';

import { parse } from './parser.js';
import { CommandRegistry } from './registry.js';
import { generateHelp, generateCommandHelp } from './help.js';
import { validate } from './validate.js';
import { bold, red, green } from './color.js';

/**
 * @typedef {Object} CLIOptions
 * @property {string} [name='cli'] - Program name
 * @property {string} [version='0.0.0'] - Version string
 * @property {string} [description] - Program description
 * @property {NodeJS.WritableStream} [output=process.stdout] - Output stream for help/errors
 * @property {Function} [exit=process.exit] - Exit function (override in tests)
 */

/**
 * @typedef {Object} CLI
 * @property {CommandRegistry} registry - The command registry
 * @property {Function} command - Register a command: command(definition)
 * @property {Function} run - Run CLI with argv: run(argv)
 * @property {Function} help - Print help text
 */

/**
 * Create a CLI application instance.
 *
 * @param {CLIOptions} [opts]
 * @returns {CLI}
 *
 * @example
 * const cli = createCLI({ name: 'mytool', version: '1.0.0' });
 * cli.command({
 *   name: 'greet',
 *   description: 'Print a greeting',
 *   options: [{ name: 'name', type: 'string', required: true }],
 *   handler: (flags) => console.log(`Hello, ${flags.name}!`),
 * });
 * await cli.run(process.argv.slice(2));
 */
export function createCLI({
  name = 'cli',
  version = '0.0.0',
  description = '',
  output = process.stdout,
  exit = process.exit,
} = {}) {
  const registry = new CommandRegistry();

  /**
   * Register a command with the CLI.
   * @param {import('./registry.js').CommandDefinition} definition
   * @returns {CLI} for chaining
   */
  function command(definition) {
    registry.register(definition);
    return api;
  }

  /**
   * Print the global help text.
   */
  function help() {
    output.write(generateHelp(registry, name));
  }

  /**
   * Execute the CLI with a parsed or raw argv array.
   *
   * @param {string[]} argv - Arguments (e.g. process.argv.slice(2))
   * @returns {Promise<any>}
   */
  async function run(argv = []) {
    const parsed = parse(argv);
    const { command: cmdName, flags, args } = parsed;

    // Global --version
    if (flags.version) {
      output.write(`${name} v${version}\n`);
      return;
    }

    // Global --help or no command
    if (flags.help || !cmdName) {
      help();
      return;
    }

    // Check for command-level --help
    if (flags.help) {
      const cmd = registry.get(cmdName);
      if (cmd) {
        output.write(generateCommandHelp(cmd, name));
      } else {
        output.write(generateHelp(registry, name));
      }
      return;
    }

    // Unknown command
    if (!registry.has(cmdName)) {
      output.write(
        `\n  ${red('Error:')} Unknown command "${bold(cmdName)}"\n\n` +
        `  Run ${green(name)} ${green('--help')} for available commands.\n\n`
      );
      exit(1);
      return;
    }

    const cmd = registry.get(cmdName);

    // Validate flags against schema
    const schema = cmd.options ?? [];
    const { valid, values, errors } = validate(flags, schema);

    if (!valid) {
      output.write(`\n  ${red('Validation errors:')}\n`);
      for (const err of errors) {
        output.write(`    • ${err}\n`);
      }
      output.write('\n');
      output.write(generateCommandHelp(cmd, name));
      exit(1);
      return;
    }

    return await registry.run(cmdName, values, args);
  }

  const api = { registry, command, run, help };
  return api;
}
