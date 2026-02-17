/**
 * @fileoverview HTTP Router — path params, wildcards, method routing, precedence.
 * @module router
 */

/**
 * Compiles a route path pattern into a regex and extracts param names.
 * Precedence (lower number = higher priority):
 *   0 — exact static  (/foo/bar)
 *   1 — parameterised (/foo/:id)
 *   2 — wildcard      (/foo/*)
 *
 * @param {string} pattern
 * @returns {{ regex: RegExp, paramNames: string[], priority: number }}
 */
function compilePath(pattern) {
  let priority = 0;
  const paramNames = [];

  const clean = pattern.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

  const regexStr = clean
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '(.*)')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      paramNames.push(name);
      priority = Math.max(priority, 1);
      return '([^/]+)';
    });

  if (clean.includes('*')) priority = 2;

  return { regex: new RegExp(`^${regexStr}$`), paramNames, priority };
}

/**
 * HTTP Router with method routing, path params (:id), wildcards (*),
 * and sorted precedence (static > parameterised > wildcard).
 */
export class Router {
  #routes = [];

  /**
   * Register a route for the given HTTP method.
   * @param {string} method
   * @param {string} pattern
   * @param {...Function} handlers
   * @returns {this}
   */
  route(method, pattern, ...handlers) {
    const { regex, paramNames, priority } = compilePath(pattern);
    this.#routes.push({ method: method.toUpperCase(), pattern, regex, paramNames, priority, handlers });
    this.#routes.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /** @param {string} pattern @param {...Function} handlers @returns {this} */
  get(pattern, ...handlers) { return this.route('GET', pattern, ...handlers); }
  /** @param {string} pattern @param {...Function} handlers @returns {this} */
  post(pattern, ...handlers) { return this.route('POST', pattern, ...handlers); }
  /** @param {string} pattern @param {...Function} handlers @returns {this} */
  put(pattern, ...handlers) { return this.route('PUT', pattern, ...handlers); }
  /** @param {string} pattern @param {...Function} handlers @returns {this} */
  delete(pattern, ...handlers) { return this.route('DELETE', pattern, ...handlers); }
  /** @param {string} pattern @param {...Function} handlers @returns {this} */
  patch(pattern, ...handlers) { return this.route('PATCH', pattern, ...handlers); }

  /**
   * Match an incoming request path and method.
   * @param {string} method
   * @param {string} pathname
   * @returns {{ handlers: Function[], params: Record<string,string> } | null}
   */
  match(method, pathname) {
    const clean = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    for (const route of this.#routes) {
      if (route.method !== method.toUpperCase()) continue;
      const m = clean.match(route.regex);
      if (!m) continue;
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      return { handlers: route.handlers, params };
    }
    return null;
  }

  /**
   * Return all registered routes.
   * @returns {Array}
   */
  routes() { return [...this.#routes]; }
}
