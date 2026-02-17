/**
 * ANSI color/style helpers — zero dependencies, no chalk.
 * Uses standard ANSI escape codes.
 *
 * @module color
 */

'use strict';

const ESC = '\x1b[';

/**
 * Wrap text in an ANSI escape sequence.
 * @param {string|number} code - ANSI code (e.g. 31 for red)
 * @param {string} text
 * @returns {string}
 */
function ansi(code, text) {
  return `${ESC}${code}m${text}${ESC}0m`;
}

/**
 * Apply red foreground color.
 * @param {string} text
 * @returns {string}
 */
export const red = (text) => ansi(31, text);

/**
 * Apply green foreground color.
 * @param {string} text
 * @returns {string}
 */
export const green = (text) => ansi(32, text);

/**
 * Apply yellow foreground color.
 * @param {string} text
 * @returns {string}
 */
export const yellow = (text) => ansi(33, text);

/**
 * Apply blue foreground color.
 * @param {string} text
 * @returns {string}
 */
export const blue = (text) => ansi(34, text);

/**
 * Apply magenta foreground color.
 * @param {string} text
 * @returns {string}
 */
export const magenta = (text) => ansi(35, text);

/**
 * Apply cyan foreground color.
 * @param {string} text
 * @returns {string}
 */
export const cyan = (text) => ansi(36, text);

/**
 * Apply white foreground color.
 * @param {string} text
 * @returns {string}
 */
export const white = (text) => ansi(37, text);

/**
 * Apply bold style.
 * @param {string} text
 * @returns {string}
 */
export const bold = (text) => ansi(1, text);

/**
 * Apply dim (low intensity) style.
 * @param {string} text
 * @returns {string}
 */
export const dim = (text) => ansi(2, text);

/**
 * Apply italic style.
 * @param {string} text
 * @returns {string}
 */
export const italic = (text) => ansi(3, text);

/**
 * Apply underline style.
 * @param {string} text
 * @returns {string}
 */
export const underline = (text) => ansi(4, text);

/**
 * Reset all styles.
 * @param {string} text
 * @returns {string}
 */
export const reset = (text) => `${ESC}0m${text}`;

/**
 * Strip all ANSI escape codes from a string.
 * Useful for plain-text output or length measurement.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Compose multiple color/style functions left-to-right.
 * e.g. compose(bold, red)('error') → bold red text
 *
 * @param {...Function} fns
 * @returns {(text: string) => string}
 */
export function compose(...fns) {
  return (text) => fns.reduceRight((acc, fn) => fn(acc), text);
}

/**
 * All color helpers as a convenience object.
 */
export const colors = {
  red, green, yellow, blue, magenta, cyan, white,
  bold, dim, italic, underline, reset, stripAnsi, compose,
};
