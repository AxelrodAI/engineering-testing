/**
 * Command registry — register commands with descriptions, options schemas, and handlers.
 *
 * @module registry
 */

'use strict';

/**
 * @typedef {Object} OptionSchema
 * @property {string} name - Option name (camelCase or kebab-case)
 * @property {'string'|'number'|'boolean'} [type='string'] - Expected type
 * @property {boolean} [required=false] - Whether the option is required
 * @property {*} [default] - Default value if not provided
 * @property {string[]} [enum] - Allowed values
 * @property {string} [description] - Human-readable description
 * @property {string} [alias] - Short flag alias (single char)
 */

/**
 * @typedef {Object} CommandDefinition
 * @property {string} name - Command name
 * @property {string} [description] - Command description
 * @property {OptionSchema[]} [options] - Options schema array
 * @property {string[]} [arguments] - Positional argument names
 * @property {Function} handler - Async or sync command handler (flags, args, ctx) => any
 */

/**
 * Registry for CLI commands.
 */
export class CommandRegistry {
  /** @type {Map<string, CommandDefinition>} */
  #commands = new Map();

  /**
   * Register a command definition.
   * Overwrites any existing command with the same name.
   *
   * @param {CommandDefinition} definition
   * @returns {this} for chaining
   */
  register(definition) {
    if (!definition || typeof definition.name !== 'string' || !definition.name.trim()) {
      throw new Error('CommandRegistry.register: definition.name must be a non-empty string');
    }
    if (typeof definition.handler !== 'function') {
      throw new Error(`CommandRegistry.register: handler must be a function (command: ${definition.name})`);
    }
    const cmd = {
      name: definition.name.trim(),
      description: definition.description ?? '',
      options: Array.isArray(definition.options) ? definition.options : [],
      arguments: Array.isArray(definition.arguments) ? definition.arguments : [],
      handler: definition.handler,
    };
    this.#commands.set(cmd.name, cmd);
    return this;
  }

  /**
   * Retrieve a registered command by name.
   *
   * @param {string} name
   * @returns {CommandDefinition|undefined}
   */
  get(name) {
    return this.#commands.get(name);
  }

  /**
   * Check whether a command is registered.
   *
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.#commands.has(name);
  }

  /**
   * List all registered command names.
   *
   * @returns {string[]}
   */
  list() {
    return [...this.#commands.keys()];
  }

  /**
   * List all registered command definitions.
   *
   * @returns {CommandDefinition[]}
   */
  all() {
    return [...this.#commands.values()];
  }

  /**
   * Unregister a command.
   *
   * @param {string} name
   * @returns {boolean} true if command existed and was removed
   */
  unregister(name) {
    return this.#commands.delete(name);
  }

  /**
   * Run a registered command by name.
   * Throws if the command is not found.
   *
   * @param {string} name - Command name
   * @param {Record<string, any>} flags - Parsed flags
   * @param {string[]} args - Positional args
   * @param {*} [ctx] - Optional context object passed to handler
   * @returns {Promise<any>} Result from the handler
   */
  async run(name, flags = {}, args = [], ctx = undefined) {
    const cmd = this.#commands.get(name);
    if (!cmd) {
      throw new Error(`Unknown command: "${name}". Run --help to see available commands.`);
    }
    return await cmd.handler(flags, args, ctx);
  }

  /**
   * Number of registered commands.
   * @type {number}
   */
  get size() {
    return this.#commands.size;
  }
}
