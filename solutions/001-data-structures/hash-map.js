/**
 * HashMap — key/value store with separate-chaining collision handling.
 *
 * Design decisions:
 *  - Initial capacity: 16 buckets.
 *  - Load-factor threshold: 0.75 — triggers a doubling resize.
 *  - Bucket entries are singly-linked lists of { key, value, next } objects.
 *  - Keys may be any value; they are converted to string for hashing
 *    (same semantics as plain JS objects used as maps).
 *  - String hashing: djb2 variant (fast, low collision rate).
 */

const INITIAL_CAPACITY = 16;
const LOAD_FACTOR = 0.75;

/** @param {string} key @param {number} capacity @returns {number} */
function hashCode(key, capacity) {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    // hash = hash * 33 ^ charCode  (djb2)
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash |= 0; // keep 32-bit integer
  }
  return Math.abs(hash) % capacity;
}

export class HashMap {
  #buckets;
  #capacity;
  #length;

  constructor(initialCapacity = INITIAL_CAPACITY) {
    this.#capacity = initialCapacity > 0 ? initialCapacity : INITIAL_CAPACITY;
    this.#buckets = new Array(this.#capacity).fill(null);
    this.#length = 0;
  }

  // ─── Internal helpers ────────────────────────────────────────────

  /** Convert any key to a string for hashing (mirrors Map key semantics for primitives). */
  #keyStr(key) {
    return String(key);
  }

  /** Index into the bucket array for a given raw key. */
  #index(key) {
    return hashCode(this.#keyStr(key), this.#capacity);
  }

  /**
   * Resize to `newCapacity` and rehash all entries.
   * @time O(n)
   */
  #resize(newCapacity) {
    const oldBuckets = this.#buckets;
    this.#capacity = newCapacity;
    this.#buckets = new Array(this.#capacity).fill(null);
    this.#length = 0;

    for (const head of oldBuckets) {
      let node = head;
      while (node !== null) {
        this.set(node.key, node.value);
        node = node.next;
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────

  /**
   * Insert or update the entry for `key`.
   * @param {*} key
   * @param {*} value
   * @returns {HashMap} `this` for chaining.
   * @time O(1) amortised (O(n) when resize triggers)
   */
  set(key, value) {
    const idx = this.#index(key);
    const keyStr = this.#keyStr(key);

    let node = this.#buckets[idx];
    while (node !== null) {
      if (node.keyStr === keyStr) {
        // Update existing entry — key is the same original key
        node.value = value;
        node.key = key;
        return this;
      }
      node = node.next;
    }

    // New entry — prepend to chain
    const newNode = {
      key,
      keyStr,
      value,
      next: this.#buckets[idx],
    };
    this.#buckets[idx] = newNode;
    this.#length++;

    if (this.#length > this.#capacity * LOAD_FACTOR) {
      this.#resize(this.#capacity * 2);
    }

    return this;
  }

  /**
   * Retrieve the value stored under `key`.
   * @param {*} key
   * @returns {*} The stored value, or `undefined` if not found.
   * @time O(1) average, O(n) worst-case (all keys hash to same bucket)
   */
  get(key) {
    const idx = this.#index(key);
    const keyStr = this.#keyStr(key);

    let node = this.#buckets[idx];
    while (node !== null) {
      if (node.keyStr === keyStr) return node.value;
      node = node.next;
    }
    return undefined;
  }

  /**
   * Remove the entry for `key`.
   * @param {*} key
   * @returns {boolean} `true` if the key existed and was removed.
   * @time O(1) average
   */
  delete(key) {
    const idx = this.#index(key);
    const keyStr = this.#keyStr(key);

    let prev = null;
    let node = this.#buckets[idx];
    while (node !== null) {
      if (node.keyStr === keyStr) {
        if (prev === null) {
          this.#buckets[idx] = node.next;
        } else {
          prev.next = node.next;
        }
        this.#length--;
        return true;
      }
      prev = node;
      node = node.next;
    }
    return false;
  }

  /**
   * Check whether `key` exists in the map.
   * @param {*} key
   * @returns {boolean}
   * @time O(1) average
   */
  has(key) {
    return this.get(key) !== undefined || this.#hasKey(key);
  }

  /** Distinguishes "key present with value undefined" from "key absent". */
  #hasKey(key) {
    const idx = this.#index(key);
    const keyStr = this.#keyStr(key);
    let node = this.#buckets[idx];
    while (node !== null) {
      if (node.keyStr === keyStr) return true;
      node = node.next;
    }
    return false;
  }

  /**
   * Return all keys as an array (insertion order not guaranteed).
   * @returns {Array}
   * @time O(n + capacity)
   */
  keys() {
    const result = [];
    for (const head of this.#buckets) {
      let node = head;
      while (node !== null) {
        result.push(node.key);
        node = node.next;
      }
    }
    return result;
  }

  /**
   * Return all values as an array (order mirrors `keys()`).
   * @returns {Array}
   * @time O(n + capacity)
   */
  values() {
    const result = [];
    for (const head of this.#buckets) {
      let node = head;
      while (node !== null) {
        result.push(node.value);
        node = node.next;
      }
    }
    return result;
  }

  /**
   * Return all [key, value] pairs.
   * @returns {Array<[*, *]>}
   * @time O(n + capacity)
   */
  entries() {
    const result = [];
    for (const head of this.#buckets) {
      let node = head;
      while (node !== null) {
        result.push([node.key, node.value]);
        node = node.next;
      }
    }
    return result;
  }

  /**
   * Number of key/value pairs stored.
   * @returns {number}
   * @time O(1)
   */
  size() {
    return this.#length;
  }

  /**
   * Remove all entries.
   * @returns {void}
   * @time O(capacity)
   */
  clear() {
    this.#buckets = new Array(this.#capacity).fill(null);
    this.#length = 0;
  }
}
