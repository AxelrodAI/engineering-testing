/**
 * Queue — First-In, First-Out (FIFO) data structure.
 *
 * Uses a doubly-linked node chain so that both enqueue and dequeue
 * are O(1) — no array shifting required.
 */

class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

export class Queue {
  #head;
  #tail;
  #length;

  constructor() {
    this.#head = null;
    this.#tail = null;
    this.#length = 0;
  }

  /**
   * Add a value to the back of the queue.
   * @param {*} value — Any value (including null/undefined).
   * @returns {number} New size of the queue.
   * @time O(1)
   */
  enqueue(value) {
    const node = new Node(value);
    if (this.#tail === null) {
      this.#head = node;
      this.#tail = node;
    } else {
      this.#tail.next = node;
      this.#tail = node;
    }
    this.#length++;
    return this.#length;
  }

  /**
   * Remove and return the front element.
   * @returns {*} The front value, or `undefined` if the queue is empty.
   * @time O(1)
   */
  dequeue() {
    if (this.#head === null) return undefined;
    const value = this.#head.value;
    this.#head = this.#head.next;
    if (this.#head === null) this.#tail = null;
    this.#length--;
    return value;
  }

  /**
   * Return the front element without removing it.
   * @returns {*} The front value, or `undefined` if empty.
   * @time O(1)
   */
  front() {
    return this.#head === null ? undefined : this.#head.value;
  }

  /**
   * Check whether the queue contains no elements.
   * @returns {boolean}
   * @time O(1)
   */
  isEmpty() {
    return this.#length === 0;
  }

  /**
   * Number of elements currently in the queue.
   * @returns {number}
   * @time O(1)
   */
  size() {
    return this.#length;
  }

  /**
   * Return a shallow-copy array of all elements, front → back.
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
   * Remove all elements.
   * @returns {void}
   * @time O(1)
   */
  clear() {
    this.#head = null;
    this.#tail = null;
    this.#length = 0;
  }
}
