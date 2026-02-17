/**
 * Stack — Last-In, First-Out (LIFO) data structure.
 *
 * Internal storage: Array (items pushed/popped from the end).
 */
export class Stack {
  #items;

  constructor() {
    this.#items = [];
  }

  /**
   * Push a value onto the top of the stack.
   * @param {*} value — Any value (including null/undefined).
   * @returns {number} New size of the stack.
   * @time O(1) amortised
   */
  push(value) {
    this.#items.push(value);
    return this.#items.length;
  }

  /**
   * Remove and return the top element.
   * @returns {*} The top value, or `undefined` if the stack is empty.
   * @time O(1)
   */
  pop() {
    return this.#items.pop();
  }

  /**
   * Return the top element without removing it.
   * @returns {*} The top value, or `undefined` if empty.
   * @time O(1)
   */
  peek() {
    return this.#items[this.#items.length - 1];
  }

  /**
   * Check whether the stack contains no elements.
   * @returns {boolean}
   * @time O(1)
   */
  isEmpty() {
    return this.#items.length === 0;
  }

  /**
   * Number of elements currently in the stack.
   * @returns {number}
   * @time O(1)
   */
  size() {
    return this.#items.length;
  }

  /**
   * Return a shallow copy of all elements, bottom → top.
   * @returns {Array}
   * @time O(n)
   */
  toArray() {
    return [...this.#items];
  }

  /**
   * Remove all elements.
   * @returns {void}
   * @time O(1)
   */
  clear() {
    this.#items = [];
  }
}
