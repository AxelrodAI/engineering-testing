// watch.js — fs.watch based re-run on file changes with debounce

import { watch } from 'fs';
import { resolve, join } from 'path';
import { readdir, stat } from 'fs/promises';

/**
 * Watch a directory for file changes and run a callback with debounce.
 * @param {string|string[]} dirs — directory or directories to watch
 * @param {Function} callback — called after debounce with changed file path
 * @param {object} options
 * @param {number} [options.debounceMs=300] — debounce delay in ms
 * @param {RegExp} [options.filter] — only trigger for matching filenames
 * @returns {{ stop: Function }} — call stop() to end watching
 */
export function watchDirs(dirs, callback, options = {}) {
  const { debounceMs = 300, filter = /\.js$/ } = options;
  const roots = (Array.isArray(dirs) ? dirs : [dirs]).map(d => resolve(d));

  let debounceTimer = null;
  let pendingFiles = new Set();
  const watchers = [];

  function schedule(file) {
    pendingFiles.add(file);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const files = [...pendingFiles];
      pendingFiles.clear();
      try {
        await callback(files);
      } catch (err) {
        console.error('[watch] callback error:', err.message);
      }
    }, debounceMs);
  }

  function startWatcher(dir) {
    try {
      const watcher = watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        if (filter && !filter.test(filename)) return;
        // Reconstruct full path
        const fullPath = join(dir, filename);
        schedule(fullPath);
      });
      watcher.on('error', (err) => {
        console.error(`[watch] error watching ${dir}:`, err.message);
      });
      watchers.push(watcher);
    } catch (err) {
      console.error(`[watch] cannot watch ${dir}:`, err.message);
    }
  }

  for (const dir of roots) {
    startWatcher(dir);
  }

  return {
    stop() {
      clearTimeout(debounceTimer);
      for (const w of watchers) {
        try { w.close(); } catch {}
      }
      watchers.length = 0;
    }
  };
}

/**
 * Simple debounce utility.
 */
export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
