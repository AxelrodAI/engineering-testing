/**
 * Help text generator — auto-generates --help output from the command registry.
 *
 * @module help
 */

'use strict';

import { bold, dim, yellow, green } from './color.js';

/**
 * Generate global help text listing all registered commands.
 *
 * @param {import('./registry.js').CommandRegistry} registry
 * @param {string} [programName='cli'] - Name of the CLI program
 * @returns {string} Help text
 */
export function generateHelp(registry, programName = 'cli') {
  const commands = registry.all();
  const lines = [];

  lines.push('');
  lines.push(`  ${bold('Usage:')} ${green(programName)} ${yellow('<command>')} [options]`);
  lines.push('');

  if (commands.length === 0) {
    lines.push(`  ${dim('No commands registered.')}`);
  } else {
    lines.push(`  ${bold('Commands:')}`);
    lines.push('');

    const maxLen = Math.max(...commands.map((c) => c.name.length), 0);
    for (const cmd of commands) {
      const padding = ' '.repeat(maxLen - cmd.name.length + 2);
      lines.push(`    ${green(cmd.name)}${padding}${dim(cmd.description || '')}`);
    }
  }

  lines.push('');
  lines.push(`  ${bold('Options:')}`);
  lines.push(`    ${yellow('--help')}${' '.repeat(8)}${dim('Show this help message')}`);
  lines.push(`    ${yellow('--version')}${' '.repeat(5)}${dim('Show version number')}`);
  lines.push('');
  lines.push(`  Run ${green(programName)} ${yellow('<command>')} ${yellow('--help')} for command-specific help.`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate per-command help text from a command definition.
 *
 * @param {import('./registry.js').CommandDefinition} cmd - Command definition
 * @param {string} [programName='cli'] - Name of the CLI program
 * @returns {string} Help text
 */
export function generateCommandHelp(cmd, programName = 'cli') {
  if (!cmd) return `  ${bold('Error:')} command not found.\n`;

  const lines = [];
  lines.push('');
  lines.push(`  ${bold('Usage:')} ${green(programName)} ${yellow(cmd.name)}${buildUsageArgs(cmd)}`);
  lines.push('');

  if (cmd.description) {
    lines.push(`  ${cmd.description}`);
    lines.push('');
  }

  if (Array.isArray(cmd.arguments) && cmd.arguments.length > 0) {
    lines.push(`  ${bold('Arguments:')}`);
    for (const arg of cmd.arguments) {
      lines.push(`    ${yellow(`<${arg}>`)}`);
    }
    lines.push('');
  }

  const opts = Array.isArray(cmd.options) ? cmd.options : [];
  if (opts.length > 0) {
    lines.push(`  ${bold('Options:')}`);
    const maxLen = Math.max(...opts.map((o) => buildOptionFlag(o).length), 0);
    for (const opt of opts) {
      const flag = buildOptionFlag(opt);
      const padding = ' '.repeat(Math.max(0, maxLen - flag.length + 2));
      const parts = [];
      if (opt.description) parts.push(opt.description);
      if (opt.required) parts.push(bold('[required]'));
      if ('default' in opt && opt.default !== undefined) parts.push(dim(`[default: ${opt.default}]`));
      if (Array.isArray(opt.enum)) parts.push(dim(`[choices: ${opt.enum.join(', ')}]`));
      lines.push(`    ${yellow(flag)}${padding}${dim(parts.join('  '))}`);
    }
    lines.push('');
  }

  lines.push(`    ${yellow('--help')}    ${dim('Show this help message')}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Build the usage argument list for a command (e.g. " <file> [options]")
 * @param {import('./registry.js').CommandDefinition} cmd
 * @returns {string}
 */
function buildUsageArgs(cmd) {
  const parts = [];
  if (Array.isArray(cmd.arguments) && cmd.arguments.length > 0) {
    for (const a of cmd.arguments) parts.push(`<${a}>`);
  }
  const opts = Array.isArray(cmd.options) ? cmd.options : [];
  if (opts.length > 0) parts.push('[options]');
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/**
 * Build the flag string for an option (e.g. "--verbose" or "-v, --verbose")
 * @param {import('./registry.js').OptionSchema} opt
 * @returns {string}
 */
function buildOptionFlag(opt) {
  let flag = `--${opt.name}`;
  if (opt.alias) flag = `-${opt.alias}, ${flag}`;
  if (opt.type && opt.type !== 'boolean') flag += ` <${opt.type}>`;
  return flag;
}
