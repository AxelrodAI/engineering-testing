/**
 * Validate and coerce parsed CLI flags/args against an options schema.
 *
 * @module validate
 */

'use strict';

/**
 * @typedef {Object} OptionSchema
 * @property {string} name - Option name (camelCase)
 * @property {'string'|'number'|'boolean'} [type='string'] - Expected type
 * @property {boolean} [required=false] - Whether the option is required
 * @property {*} [default] - Default value if not provided
 * @property {string[]} [enum] - Allowed values (checked after coercion)
 * @property {string} [description] - Human-readable description
 * @property {string} [alias] - Single-char short flag alias
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {Record<string, any>} values - Coerced/defaulted values
 * @property {string[]} errors - Array of error messages (empty if valid)
 */

/**
 * Validate and coerce a flags object against an options schema.
 * Applies defaults, type coercion, required checks, and enum constraints.
 *
 * @param {Record<string, any>} flags - Raw parsed flags
 * @param {OptionSchema[]} schema - Array of option schema definitions
 * @returns {ValidationResult}
 */
export function validate(flags = {}, schema = []) {
  if (!flags || typeof flags !== 'object') flags = {};
  if (!Array.isArray(schema)) schema = [];

  const errors = [];
  const values = {};

  // Build an alias → name map for short flags
  const aliasMap = {};
  for (const opt of schema) {
    if (opt.alias && typeof opt.alias === 'string') {
      aliasMap[opt.alias] = opt.name;
    }
  }

  // Resolve alias references in flags
  const resolvedFlags = { ...flags };
  for (const [alias, name] of Object.entries(aliasMap)) {
    if (alias in resolvedFlags && !(name in resolvedFlags)) {
      resolvedFlags[name] = resolvedFlags[alias];
    }
  }

  for (const opt of schema) {
    const name = opt.name;
    const type = opt.type ?? 'string';
    const required = opt.required ?? false;
    const defaultVal = 'default' in opt ? opt.default : undefined;
    const allowedValues = Array.isArray(opt.enum) ? opt.enum : null;

    let raw = name in resolvedFlags ? resolvedFlags[name] : undefined;

    // Apply default if not provided
    if (raw === undefined) {
      if (defaultVal !== undefined) {
        raw = defaultVal;
      } else if (type === 'boolean') {
        raw = false;
      }
    }

    // Required check (after default application)
    if (required && (raw === undefined || raw === null || raw === '')) {
      errors.push(`Missing required option: --${name}`);
      continue;
    }

    // Skip optional undefined values
    if (raw === undefined) {
      continue;
    }

    // Type coercion
    const coerced = coerce(raw, type, name, errors);
    if (coerced === COERCION_ERROR) continue;

    // Enum constraint (compare as strings for consistency)
    if (allowedValues) {
      const strVal = String(coerced);
      if (!allowedValues.map(String).includes(strVal)) {
        errors.push(
          `Invalid value for --${name}: "${strVal}". Allowed: ${allowedValues.map((v) => `"${v}"`).join(', ')}`
        );
        continue;
      }
    }

    values[name] = coerced;
  }

  // Pass through any extra flags that aren't in the schema (unvalidated)
  for (const [k, v] of Object.entries(resolvedFlags)) {
    if (!(k in values) && !schema.some((o) => o.name === k)) {
      values[k] = v;
    }
  }

  return {
    valid: errors.length === 0,
    values,
    errors,
  };
}

/** Sentinel for a coercion error (avoids adding value to results) */
const COERCION_ERROR = Symbol('COERCION_ERROR');

/**
 * Coerce a raw value to the specified type.
 * Records error into errors array on failure and returns COERCION_ERROR.
 *
 * @param {*} raw
 * @param {'string'|'number'|'boolean'} type
 * @param {string} name - Option name (for error messages)
 * @param {string[]} errors - Mutable errors array
 * @returns {string|number|boolean|symbol}
 */
function coerce(raw, type, name, errors) {
  switch (type) {
    case 'string':
      return String(raw);

    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        errors.push(`Invalid number for --${name}: "${raw}"`);
        return COERCION_ERROR;
      }
      return n;
    }

    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === '1' || raw === 'yes') return true;
      if (raw === 'false' || raw === '0' || raw === 'no') return false;
      errors.push(`Invalid boolean for --${name}: "${raw}". Use true/false, 1/0, or yes/no`);
      return COERCION_ERROR;
    }

    default:
      return String(raw);
  }
}
