/**
 * Interactive CLI prompts — confirm, select, input.
 * Uses Node's readline module. Fully testable via stream injection.
 *
 * @module prompt
 */

'use strict';

import readline from 'node:readline';
import { Readable, Writable } from 'node:stream';
import { bold, yellow, green, dim } from './color.js';

/** A no-op Writable that discards all output (used in tests). */
class NullWritable extends Writable {
  _write(_chunk, _enc, cb) { cb(); }
}

/**
 * Ask a yes/no confirmation question.
 *
 * @param {string} question - Question text
 * @param {object} [opts]
 * @param {NodeJS.ReadableStream} [opts.input=process.stdin] - Input stream
 * @param {NodeJS.WritableStream} [opts.output=process.stdout] - Output stream
 * @param {boolean} [opts.defaultValue] - Default if user just presses Enter (undefined = require explicit y/n)
 * @returns {Promise<boolean>}
 */
export async function confirm(question, {
  input = process.stdin,
  output = process.stdout,
  defaultValue,
} = {}) {
  const hint = defaultValue === true ? 'Y/n' : defaultValue === false ? 'y/N' : 'y/n';
  const prompt = `${bold(question)} ${dim(`(${hint})`)} `;

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input, output, terminal: false });
    output.write(prompt);

    let answered = false;

    rl.once('line', (line) => {
      answered = true;
      rl.close();
      const answer = line.trim().toLowerCase();
      if (answer === 'y' || answer === 'yes') return resolve(true);
      if (answer === 'n' || answer === 'no') return resolve(false);
      if (answer === '' && defaultValue !== undefined) return resolve(defaultValue);
      // Any other input: treat as false (no)
      resolve(false);
    });

    rl.once('close', () => {
      if (!answered) {
        if (defaultValue !== undefined) resolve(defaultValue);
        else reject(new Error('confirm: stream ended without input'));
      }
    });

    rl.once('error', reject);
  });
}

/**
 * Present a numbered list of choices and ask the user to select one.
 *
 * @param {string} question - Question text
 * @param {string[]} choices - List of options
 * @param {object} [opts]
 * @param {NodeJS.ReadableStream} [opts.input=process.stdin] - Input stream
 * @param {NodeJS.WritableStream} [opts.output=process.stdout] - Output stream
 * @returns {Promise<string>} The chosen option string
 */
export async function select(question, choices, {
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('select: choices must be a non-empty array');
  }

  return new Promise((resolve, reject) => {
    output.write(`\n${bold(question)}\n`);
    choices.forEach((choice, idx) => {
      output.write(`  ${yellow(`${idx + 1}.`)} ${choice}\n`);
    });
    output.write(`\n${green('Enter number')} (1-${choices.length}): `);

    const rl = readline.createInterface({ input, output, terminal: false });
    let answered = false;

    rl.once('line', (line) => {
      answered = true;
      rl.close();
      const n = parseInt(line.trim(), 10);
      if (Number.isNaN(n) || n < 1 || n > choices.length) {
        reject(new Error(`select: invalid choice "${line.trim()}". Enter 1-${choices.length}`));
      } else {
        resolve(choices[n - 1]);
      }
    });

    rl.once('close', () => {
      if (!answered) reject(new Error('select: stream ended without input'));
    });

    rl.once('error', reject);
  });
}

/**
 * Ask the user to type in a free-form text input.
 *
 * @param {string} question - Question text / label
 * @param {object} [opts]
 * @param {NodeJS.ReadableStream} [opts.input=process.stdin] - Input stream
 * @param {NodeJS.WritableStream} [opts.output=process.stdout] - Output stream
 * @param {string} [opts.defaultValue] - Default if user presses Enter with no input
 * @param {(value: string) => string|null} [opts.validate] - Returns error string or null; null = valid
 * @returns {Promise<string>}
 */
export async function input(question, {
  input: inputStream = process.stdin,
  output = process.stdout,
  defaultValue,
  validate: validateFn,
} = {}) {
  const hint = defaultValue !== undefined ? ` ${dim(`[${defaultValue}]`)}` : '';
  const prompt = `${bold(question)}${hint}: `;

  return new Promise((resolve, reject) => {
    output.write(prompt);

    const rl = readline.createInterface({ input: inputStream, output, terminal: false });
    let answered = false;

    rl.once('line', (line) => {
      answered = true;
      rl.close();
      const value = line.trim() !== '' ? line.trim() : (defaultValue ?? '');

      if (validateFn) {
        const err = validateFn(value);
        if (err) return reject(new Error(`input validation failed: ${err}`));
      }

      resolve(value);
    });

    rl.once('close', () => {
      if (!answered) {
        if (defaultValue !== undefined) resolve(defaultValue);
        else reject(new Error('input: stream ended without input'));
      }
    });

    rl.once('error', reject);
  });
}

/**
 * Create a mock readable stream from a string (for testing).
 * Automatically appends a newline if missing.
 *
 * @param {string} text - Text to stream
 * @returns {import('node:stream').Readable}
 */
export function mockInput(text) {
  const str = typeof text === 'string' ? text : String(text ?? '');
  const withNewline = str.endsWith('\n') ? str : str + '\n';
  return Readable.from([withNewline]);
}

/**
 * Create a null (no-op) output stream that discards all writes. Use in tests.
 *
 * @returns {import('node:stream').Writable}
 */
export function nullOutput() {
  return new NullWritable();
}
