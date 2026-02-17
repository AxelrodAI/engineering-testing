/**
 * Singly Linked List.
 *
 * Each node holds a value and a pointer to the next node.
 * Methods match the challenge spec: append, prepend, delete, find,
 * toArray, size, reverse.
 */

class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

export class LinkedList {
  #head;
  #length;

  constructor() {
    this.#head = null;
    this.#length = 0;
  }

  // ─── Internal helpers ────────────────────────────────────────────

  /** Walk to the last node. O(n) */
  #tail() {
    let current = this.#head;
    while (current !== null && current.next !== null) {
      current = current.next;
    }
    return current;
  }

  // ─── Public API ──────────────────────────────────────────────────

  /**
   * Add a node with `value` at the end of the list.
   * @param {*} value
   * @returns {LinkedList} `this` for chaining.
   * @time O(n) — must traverse to tail
   */
  append(value) {
    const node = new Node(value);
    if (this.#head === null) {
      this.#head = node;
    } else {
      this.#tail().next = node;
    }
    this.#length++;
    return this;
  }

  /**
   * Add a node with `value` at the beginning of the list.
   * @param {*} value
   * @returns {LinkedList} `this` for chaining.
   * @time O(1)
   */
  prepend(value) {
    const node = new Node(value);
    node.next = this.#head;
    this.#head = node;
    this.#length++;
    return this;
  }

  /**
   * Remove the first node whose value strictly equals `value`.
   * If no such node exists, the list is unchanged.
   * @param {*} value
   * @returns {boolean} `true` if a node was removed, `false` otherwise.
   * @time O(n)
   */
  delete(value) {
    if (this.#head === null) return false;

    // Head is the target
    if (this.#head.value === value) {
      this.#head = this.#head.next;
      this.#length--;
      return true;
    }

    let prev = this.#head;
    let current = this.#head.next;
    while (current !== null) {
      if (current.value === value) {
        prev.next = current.next;
        this.#length--;
        return true;
      }
      prev = current;
      current = current.next;
    }
    return false;
  }

  /**
   * Return the value of the first node that satisfies `predicate`,
   * or `undefined` if none match.
   * When called with a non-function argument it uses strict equality.
   *
   * @param {Function|*} predicate — Callback `(value) => bool` OR a value.
   * @returns {*} Matched value or `undefined`.
   * @time O(n)
   */
  find(predicate) {
    const test =
      typeof predicate === 'function' ? predicate : (v) => v === predicate;

    let current = this.#head;
    while (current !== null) {
      if (test(current.value)) return current.value;
      current = current.next;
    }
    return undefined;
  }

  /**
   * Return a plain array of all values, head → tail.
   * @returns {Array}
   * @time O(n)
   */
  toArray() {
    const result = [];
    let current = this.#head;
    while (current !== null) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }

  /**
   * Number of nodes in the list.
   * @returns {number}
   * @time O(1)
   */
  size() {
    return this.#length;
  }

  /**
   * Reverse the list in place (no extra memory beyond a few pointers).
   * @returns {LinkedList} `this` for chaining.
   * @time O(n) | Space O(1)
   */
  reverse() {
    let prev = null;
    let current = this.#head;
    while (current !== null) {
      const next = current.next;
      current.next = prev;
      prev = current;
      current = next;
    }
    this.#head = prev;
    return this;
  }

  /**
   * Check whether the list is empty.
   * @returns {boolean}
   * @time O(1)
   */
  isEmpty() {
    return this.#length === 0;
  }

  /**
   * Remove all nodes.
   * @returns {void}
   * @time O(1)
   */
  clear() {
    this.#head = null;
    this.#length = 0;
  }
}
