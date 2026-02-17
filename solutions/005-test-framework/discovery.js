// discovery.js — Find and run *.test.js files recursively

import { readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

/**
 * Recursively find all files matching a pattern in a directory.
 * @param {string} dir — root directory
 * @param {RegExp|string} pattern — filename pattern (default: *.test.js)
 * @returns {Promise<string[]>} absolute file paths
 */
export async function findTestFiles(dir, pattern = /\.test\.js$/) {
  const root = resolve(dir);
  const results = [];

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current);
    } catch {
      return; // directory not readable
    }

    for (const entry of entries) {
      // Skip common noise directories
      if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue;

      const fullPath = join(current, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        await walk(fullPath);
      } else if (info.isFile()) {
        const matches = pattern instanceof RegExp
          ? pattern.test(entry)
          : entry.includes(pattern);
        if (matches) results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results.sort(); // deterministic order
}

/**
 * Run a single test file by importing it.
 * The file is expected to import and use the framework's globals.
 * Returns the test results (if the file exports a `run` function or calls run internally).
 */
export async function runTestFile(filePath) {
  const url = pathToFileURL(filePath).href;
  try {
    await import(url);
  } catch (err) {
    throw new Error(`Failed to load test file "${filePath}": ${err.message}`);
  }
}

/**
 * Discover and run all test files in a directory.
 * @param {string} dir — root directory to search
 * @param {object} options
 * @param {RegExp} [options.pattern] — file pattern
 * @param {Reporter} [options.reporter] — reporter instance
 * @returns {Promise<{files: string[], stats: object}>}
 */
export async function discover(dir, options = {}) {
  const { pattern = /\.test\.js$/ } = options;
  const files = await findTestFiles(dir, pattern);
  return files;
}
