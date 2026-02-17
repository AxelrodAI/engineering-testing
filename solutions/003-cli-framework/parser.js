/**
 * CLI argument parser — parses argv into commands, flags, and positional args.
 * Supports:
 *   --flag              boolean true
 *   --flag=value        value (string/number auto-coerced later)
 *   --flag value        value (string)
 *   --no-flag           boolean false (negation)
 *   -v                  short flag boolean true
 *   -v value            short flag with value
 *   -abc                combined short flags (each → true)
 *   --                  end-of-flags marker; all subsequent are positional
 *   "quoted strings"    handled at the argv level (shell does this; we handle = notation)
 *
 * @module parser
 */

'use strict';

/**
 * @typedef {Object} ParseResult
 * @property {string|null} command - First positional argument (the command name), or null
 * @property {Record<string, string|boolean>} flags - Parsed flags map
 * @property {string[]} args - Remaining positional arguments (after the command)
 */

/**
 * Parse an argv array (e.g. process.argv.slice(2)) into a structured result.
 *
 * @param {string[]} argv - Argument array to parse
 * @returns {ParseResult}
 */
export function parse(argv) {
  if (!Array.isArray(argv)) argv = [];

  const flags = {};
  const positional = [];
  let endOfFlags = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);

    // -- marks end of flags
    if (arg === '--') {
      endOfFlags = true;
      continue;
    }

    if (endOfFlags) {
      positional.push(arg);
      continue;
    }

    // Long flag: --flag or --flag=value or --no-flag
    if (arg.startsWith('--')) {
      const body = arg.slice(2);

      // --no-flag negation
      if (body.startsWith('no-') && !body.includes('=')) {
        const key = camelCase(body.slice(3));
        flags[key] = false;
        continue;
      }

      // --flag=value (possibly quoted: --flag="John Doe")
      const eqIdx = body.indexOf('=');
      if (eqIdx !== -1) {
        const key = camelCase(body.slice(0, eqIdx));
        let value = body.slice(eqIdx + 1);
        // Strip surrounding quotes
        value = stripQuotes(value);
        flags[key] = value;
        continue;
      }

      // --flag [value] — peek at next arg
      const key = camelCase(body);
      const next = argv[i + 1];
      if (next !== undefined && !isFlag(next)) {
        flags[key] = String(next);
        i++; // consume next
      } else {
        flags[key] = true;
      }
      continue;
    }

    // Short flag(s): -v or -abc or -v value
    if (arg.startsWith('-') && arg.length > 1) {
      const body = arg.slice(1);

      // Single short flag, possibly with a value
      if (body.length === 1) {
        const key = body;
        const next = argv[i + 1];
        if (next !== undefined && !isFlag(next)) {
          flags[key] = String(next);
          i++; // consume next
        } else {
          flags[key] = true;
        }
        continue;
      }

      // Combined short flags: -abc → a=true, b=true, c=true
      // Unless it looks like -n5 (single letter + digits → short flag with value)
      if (/^[a-zA-Z][a-zA-Z]+$/.test(body)) {
        for (const ch of body) {
          flags[ch] = true;
        }
        continue;
      }

      // -n5 style: first char is flag, rest is value
      const singleKey = body[0];
      const singleVal = body.slice(1);
      flags[singleKey] = singleVal;
      continue;
    }

    // Positional argument
    positional.push(arg);
  }

  // First positional is the command, rest are args
  const command = positional.length > 0 ? positional[0] : null;
  const args = positional.slice(1);

  return { command, flags, args };
}

/**
 * Check if a token looks like a flag (starts with - or --)
 * @param {string} token
 * @returns {boolean}
 */
function isFlag(token) {
  return typeof token === 'string' && token.startsWith('-') && token.length > 1;
}

/**
 * Convert a kebab-case string to camelCase.
 * e.g. "dry-run" → "dryRun"
 * @param {string} str
 * @returns {string}
 */
function camelCase(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Strip surrounding single or double quotes from a string.
 * @param {string} str
 * @returns {string}
 */
function stripQuotes(str) {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}
