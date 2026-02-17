/**
 * Comprehensive test suite for Challenge 001 — Data Structures Library.
 * Runner: node --test solutions/001-data-structures/data-structures.test.js
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Stack } from './stack.js';
import { Queue } from './queue.js';
import { LinkedList } from './linked-list.js';
import { HashMap } from './hash-map.js';

// ════════════════════════════════════════════════════════════════════
// STACK
// ════════════════════════════════════════════════════════════════════
describe('Stack', () => {
  let stack;
  beforeEach(() => { stack = new Stack(); });

  // --- Constructor / initial state ---
  it('starts empty', () => {
    assert.equal(stack.size(), 0);
    assert.equal(stack.isEmpty(), true);
  });

  it('peek returns undefined on empty stack', () => {
    assert.equal(stack.peek(), undefined);
  });

  it('pop returns undefined on empty stack', () => {
    assert.equal(stack.pop(), undefined);
  });

  it('toArray returns [] on empty stack', () => {
    assert.deepEqual(stack.toArray(), []);
  });

  // --- Push ---
  it('push adds element and returns new size', () => {
    const size = stack.push(1);
    assert.equal(size, 1);
    assert.equal(stack.size(), 1);
    assert.equal(stack.isEmpty(), false);
  });

  it('push multiple elements maintains LIFO order', () => {
    stack.push('a');
    stack.push('b');
    stack.push('c');
    assert.equal(stack.peek(), 'c');
    assert.deepEqual(stack.toArray(), ['a', 'b', 'c']);
  });

  it('push accepts null and undefined', () => {
    stack.push(null);
    stack.push(undefined);
    assert.equal(stack.size(), 2);
    assert.equal(stack.peek(), undefined);
  });

  it('push accepts objects', () => {
    const obj = { x: 1 };
    stack.push(obj);
    assert.deepEqual(stack.peek(), obj);
  });

  it('push accepts duplicate values', () => {
    stack.push(42);
    stack.push(42);
    assert.equal(stack.size(), 2);
  });

  // --- Pop ---
  it('pop removes and returns top element', () => {
    stack.push(10);
    stack.push(20);
    assert.equal(stack.pop(), 20);
    assert.equal(stack.size(), 1);
  });

  it('pop all elements one by one', () => {
    for (let i = 1; i <= 5; i++) stack.push(i);
    for (let i = 5; i >= 1; i--) {
      assert.equal(stack.pop(), i);
    }
    assert.equal(stack.isEmpty(), true);
  });

  // --- Peek ---
  it('peek does not remove the top element', () => {
    stack.push(99);
    assert.equal(stack.peek(), 99);
    assert.equal(stack.size(), 1);
  });

  // --- toArray ---
  it('toArray does not mutate the stack', () => {
    stack.push(1);
    stack.push(2);
    const arr = stack.toArray();
    arr.push(99);
    assert.equal(stack.size(), 2);
  });

  // --- Clear ---
  it('clear empties the stack', () => {
    stack.push(1);
    stack.push(2);
    stack.clear();
    assert.equal(stack.size(), 0);
    assert.equal(stack.isEmpty(), true);
    assert.equal(stack.pop(), undefined);
  });

  // --- Large input ---
  it('handles 10,000 pushes and pops correctly', () => {
    const N = 10_000;
    for (let i = 0; i < N; i++) stack.push(i);
    assert.equal(stack.size(), N);
    for (let i = N - 1; i >= 0; i--) {
      assert.equal(stack.pop(), i);
    }
    assert.equal(stack.isEmpty(), true);
  });

  // --- Mixed push/pop interleaving ---
  it('interleaved push and pop behaves correctly', () => {
    stack.push(1);
    stack.push(2);
    assert.equal(stack.pop(), 2);
    stack.push(3);
    assert.equal(stack.pop(), 3);
    assert.equal(stack.pop(), 1);
    assert.equal(stack.pop(), undefined);
  });
});

// ════════════════════════════════════════════════════════════════════
// QUEUE
// ════════════════════════════════════════════════════════════════════
describe('Queue', () => {
  let queue;
  beforeEach(() => { queue = new Queue(); });

  // --- Initial state ---
  it('starts empty', () => {
    assert.equal(queue.size(), 0);
    assert.equal(queue.isEmpty(), true);
  });

  it('front returns undefined on empty queue', () => {
    assert.equal(queue.front(), undefined);
  });

  it('dequeue returns undefined on empty queue', () => {
    assert.equal(queue.dequeue(), undefined);
  });

  it('toArray returns [] on empty queue', () => {
    assert.deepEqual(queue.toArray(), []);
  });

  // --- Enqueue ---
  it('enqueue adds element and returns new size', () => {
    const size = queue.enqueue('hello');
    assert.equal(size, 1);
    assert.equal(queue.isEmpty(), false);
  });

  it('enqueue maintains FIFO order', () => {
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    assert.deepEqual(queue.toArray(), [1, 2, 3]);
    assert.equal(queue.front(), 1);
  });

  it('enqueue accepts null and undefined', () => {
    queue.enqueue(null);
    queue.enqueue(undefined);
    assert.equal(queue.size(), 2);
    assert.equal(queue.front(), null);
  });

  it('enqueue accepts duplicate values', () => {
    queue.enqueue('x');
    queue.enqueue('x');
    assert.equal(queue.size(), 2);
  });

  // --- Dequeue ---
  it('dequeue removes and returns the front element', () => {
    queue.enqueue('a');
    queue.enqueue('b');
    assert.equal(queue.dequeue(), 'a');
    assert.equal(queue.size(), 1);
  });

  it('dequeue all elements in FIFO order', () => {
    for (let i = 1; i <= 5; i++) queue.enqueue(i);
    for (let i = 1; i <= 5; i++) {
      assert.equal(queue.dequeue(), i);
    }
    assert.equal(queue.isEmpty(), true);
  });

  it('dequeue until empty leaves queue in valid state', () => {
    queue.enqueue(1);
    queue.dequeue();
    assert.equal(queue.size(), 0);
    assert.equal(queue.isEmpty(), true);
    assert.equal(queue.front(), undefined);
    queue.enqueue(2);
    assert.equal(queue.front(), 2);
    assert.equal(queue.size(), 1);
  });

  // --- Front ---
  it('front does not mutate the queue', () => {
    queue.enqueue(7);
    queue.front();
    assert.equal(queue.size(), 1);
  });

  // --- toArray ---
  it('toArray does not mutate the queue', () => {
    queue.enqueue(1);
    const arr = queue.toArray();
    arr.push(99);
    assert.equal(queue.size(), 1);
  });

  // --- Clear ---
  it('clear empties the queue', () => {
    queue.enqueue(1);
    queue.enqueue(2);
    queue.clear();
    assert.equal(queue.size(), 0);
    assert.equal(queue.front(), undefined);
    assert.equal(queue.dequeue(), undefined);
  });

  // --- Large input ---
  it('handles 10,000 enqueues and dequeues correctly', () => {
    const N = 10_000;
    for (let i = 0; i < N; i++) queue.enqueue(i);
    assert.equal(queue.size(), N);
    for (let i = 0; i < N; i++) {
      assert.equal(queue.dequeue(), i);
    }
    assert.equal(queue.isEmpty(), true);
  });

  // --- Interleaving ---
  it('interleaved enqueue and dequeue is correct', () => {
    queue.enqueue('a');
    queue.enqueue('b');
    assert.equal(queue.dequeue(), 'a');
    queue.enqueue('c');
    assert.deepEqual(queue.toArray(), ['b', 'c']);
  });
});

// ════════════════════════════════════════════════════════════════════
// LINKED LIST
// ════════════════════════════════════════════════════════════════════
describe('LinkedList', () => {
  let list;
  beforeEach(() => { list = new LinkedList(); });

  // --- Initial state ---
  it('starts empty', () => {
    assert.equal(list.size(), 0);
    assert.equal(list.isEmpty(), true);
    assert.deepEqual(list.toArray(), []);
  });

  // --- Append ---
  it('append adds to the end', () => {
    list.append(1).append(2).append(3);
    assert.deepEqual(list.toArray(), [1, 2, 3]);
  });

  it('append returns the list for chaining', () => {
    const result = list.append(5);
    assert.equal(result, list);
  });

  it('append accepts null and undefined', () => {
    list.append(null).append(undefined);
    assert.deepEqual(list.toArray(), [null, undefined]);
  });

  it('append increments size', () => {
    list.append('a');
    list.append('b');
    assert.equal(list.size(), 2);
    assert.equal(list.isEmpty(), false);
  });

  // --- Prepend ---
  it('prepend adds to the beginning', () => {
    list.append(2).prepend(1);
    assert.deepEqual(list.toArray(), [1, 2]);
  });

  it('prepend on empty list', () => {
    list.prepend('only');
    assert.deepEqual(list.toArray(), ['only']);
    assert.equal(list.size(), 1);
  });

  it('prepend returns the list for chaining', () => {
    assert.equal(list.prepend(1), list);
  });

  it('multiple prepends build list in reverse order', () => {
    list.prepend(3).prepend(2).prepend(1);
    assert.deepEqual(list.toArray(), [1, 2, 3]);
  });

  // --- Delete ---
  it('delete removes the first matching node', () => {
    list.append(1).append(2).append(3);
    const removed = list.delete(2);
    assert.equal(removed, true);
    assert.deepEqual(list.toArray(), [1, 3]);
    assert.equal(list.size(), 2);
  });

  it('delete the head node', () => {
    list.append(10).append(20);
    list.delete(10);
    assert.deepEqual(list.toArray(), [20]);
  });

  it('delete the tail node', () => {
    list.append(10).append(20);
    list.delete(20);
    assert.deepEqual(list.toArray(), [10]);
  });

  it('delete returns false when value not found', () => {
    list.append(1);
    assert.equal(list.delete(99), false);
    assert.equal(list.size(), 1);
  });

  it('delete on empty list returns false', () => {
    assert.equal(list.delete(1), false);
  });

  it('delete only removes the FIRST occurrence of duplicates', () => {
    list.append(5).append(5).append(5);
    list.delete(5);
    assert.deepEqual(list.toArray(), [5, 5]);
    assert.equal(list.size(), 2);
  });

  it('delete single-element list', () => {
    list.append(42);
    list.delete(42);
    assert.deepEqual(list.toArray(), []);
    assert.equal(list.isEmpty(), true);
  });

  // --- Find ---
  it('find with value argument returns the value', () => {
    list.append(1).append(2).append(3);
    assert.equal(list.find(2), 2);
  });

  it('find with predicate function', () => {
    list.append({ id: 1 }).append({ id: 2 });
    const found = list.find((v) => v.id === 2);
    assert.deepEqual(found, { id: 2 });
  });

  it('find returns undefined when not found', () => {
    list.append(1).append(2);
    assert.equal(list.find(99), undefined);
  });

  it('find on empty list returns undefined', () => {
    assert.equal(list.find(1), undefined);
  });

  it('find returns first match when duplicates exist', () => {
    list.append(3).append(3);
    const hits = [];
    list.find((v) => { hits.push(v); return v === 3; });
    assert.equal(hits.length, 1); // stopped after first match
  });

  // --- toArray ---
  it('toArray returns a fresh copy each time', () => {
    list.append(1);
    const a = list.toArray();
    const b = list.toArray();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });

  // --- Reverse ---
  it('reverse reverses the list in place', () => {
    list.append(1).append(2).append(3);
    list.reverse();
    assert.deepEqual(list.toArray(), [3, 2, 1]);
  });

  it('reverse single-element list is a no-op', () => {
    list.append(42);
    list.reverse();
    assert.deepEqual(list.toArray(), [42]);
  });

  it('reverse empty list is a no-op', () => {
    list.reverse();
    assert.deepEqual(list.toArray(), []);
  });

  it('double reverse returns to original', () => {
    list.append(1).append(2).append(3);
    list.reverse().reverse();
    assert.deepEqual(list.toArray(), [1, 2, 3]);
  });

  it('reverse returns the list for chaining', () => {
    assert.equal(list.append(1).reverse(), list);
  });

  // --- Size ---
  it('size stays correct through mixed operations', () => {
    list.append(1).append(2).append(3);
    list.delete(2);
    list.prepend(0);
    assert.equal(list.size(), 3);
  });

  // --- Clear ---
  it('clear resets to empty state', () => {
    list.append(1).append(2);
    list.clear();
    assert.equal(list.size(), 0);
    assert.equal(list.isEmpty(), true);
    assert.deepEqual(list.toArray(), []);
  });

  // --- Large input ---
  it('handles 10,000 appends', () => {
    const N = 10_000;
    for (let i = 0; i < N; i++) list.append(i);
    assert.equal(list.size(), N);
    const arr = list.toArray();
    assert.equal(arr[0], 0);
    assert.equal(arr[N - 1], N - 1);
  });
});

// ════════════════════════════════════════════════════════════════════
// HASH MAP
// ════════════════════════════════════════════════════════════════════
describe('HashMap', () => {
  let map;
  beforeEach(() => { map = new HashMap(); });

  // --- Initial state ---
  it('starts empty', () => {
    assert.equal(map.size(), 0);
    assert.deepEqual(map.keys(), []);
    assert.deepEqual(map.values(), []);
  });

  // --- Set / Get ---
  it('set stores a value and get retrieves it', () => {
    map.set('name', 'Alice');
    assert.equal(map.get('name'), 'Alice');
  });

  it('set returns the map for chaining', () => {
    assert.equal(map.set('a', 1), map);
  });

  it('set overwrites existing key', () => {
    map.set('k', 'v1');
    map.set('k', 'v2');
    assert.equal(map.get('k'), 'v2');
    assert.equal(map.size(), 1);
  });

  it('get returns undefined for missing key', () => {
    assert.equal(map.get('missing'), undefined);
  });

  it('supports numeric keys (coerced to string)', () => {
    map.set(42, 'answer');
    assert.equal(map.get(42), 'answer');
    assert.equal(map.get('42'), 'answer'); // same key string
  });

  it('stores and retrieves null as a value', () => {
    map.set('nullish', null);
    assert.equal(map.get('nullish'), null);
    assert.equal(map.has('nullish'), true);
  });

  it('stores and retrieves false as a value', () => {
    map.set('flag', false);
    assert.equal(map.get('flag'), false);
    assert.equal(map.has('flag'), true);
  });

  it('stores and retrieves 0 as a value', () => {
    map.set('zero', 0);
    assert.equal(map.get('zero'), 0);
    assert.equal(map.has('zero'), true);
  });

  it('stores object values correctly', () => {
    const obj = { x: 10 };
    map.set('obj', obj);
    assert.deepEqual(map.get('obj'), obj);
  });

  // --- Has ---
  it('has returns true for existing key', () => {
    map.set('x', 1);
    assert.equal(map.has('x'), true);
  });

  it('has returns false for missing key', () => {
    assert.equal(map.has('nope'), false);
  });

  it('has returns true even when value is undefined', () => {
    map.set('undef', undefined);
    assert.equal(map.has('undef'), true);
  });

  // --- Delete ---
  it('delete removes a key and returns true', () => {
    map.set('x', 1);
    assert.equal(map.delete('x'), true);
    assert.equal(map.has('x'), false);
    assert.equal(map.size(), 0);
  });

  it('delete returns false for missing key', () => {
    assert.equal(map.delete('ghost'), false);
  });

  it('can re-set a deleted key', () => {
    map.set('k', 1);
    map.delete('k');
    map.set('k', 2);
    assert.equal(map.get('k'), 2);
    assert.equal(map.size(), 1);
  });

  // --- Keys / Values ---
  it('keys returns all keys', () => {
    map.set('a', 1).set('b', 2).set('c', 3);
    const keys = map.keys().sort();
    assert.deepEqual(keys, ['a', 'b', 'c']);
  });

  it('values returns all values', () => {
    map.set('a', 1).set('b', 2).set('c', 3);
    const values = map.values().sort((a, b) => a - b);
    assert.deepEqual(values, [1, 2, 3]);
  });

  it('entries returns all [key, value] pairs', () => {
    map.set('x', 10).set('y', 20);
    const entries = map.entries().sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepEqual(entries, [['x', 10], ['y', 20]]);
  });

  // --- Size ---
  it('size reflects current entry count', () => {
    assert.equal(map.size(), 0);
    map.set('a', 1);
    assert.equal(map.size(), 1);
    map.set('a', 2); // overwrite — no size change
    assert.equal(map.size(), 1);
    map.set('b', 3);
    assert.equal(map.size(), 2);
    map.delete('a');
    assert.equal(map.size(), 1);
  });

  // --- Collision handling ---
  it('handles deliberate hash collisions via separate chaining', () => {
    // Use a tiny capacity (2) to guarantee collisions
    const tiny = new HashMap(2);
    tiny.set('a', 1);
    tiny.set('b', 2);
    tiny.set('c', 3);
    tiny.set('d', 4);
    assert.equal(tiny.get('a'), 1);
    assert.equal(tiny.get('b'), 2);
    assert.equal(tiny.get('c'), 3);
    assert.equal(tiny.get('d'), 4);
    assert.equal(tiny.size(), 4);
  });

  // --- Resize / Load factor ---
  it('resize preserves all entries', () => {
    const N = 100;
    for (let i = 0; i < N; i++) map.set(`key${i}`, i);
    assert.equal(map.size(), N);
    for (let i = 0; i < N; i++) {
      assert.equal(map.get(`key${i}`), i);
    }
  });

  // --- Clear ---
  it('clear empties the map', () => {
    map.set('a', 1).set('b', 2);
    map.clear();
    assert.equal(map.size(), 0);
    assert.equal(map.has('a'), false);
    assert.deepEqual(map.keys(), []);
  });

  // --- Large input ---
  it('handles 5,000 unique entries with correct retrieval', () => {
    const N = 5_000;
    for (let i = 0; i < N; i++) map.set(`k${i}`, i * 2);
    assert.equal(map.size(), N);
    for (let i = 0; i < N; i++) {
      assert.equal(map.get(`k${i}`), i * 2);
    }
  });

  it('handles repeated set/delete cycles without leaking size', () => {
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < 50; i++) map.set(`r${i}`, i);
      for (let i = 0; i < 50; i++) map.delete(`r${i}`);
    }
    assert.equal(map.size(), 0);
  });
});
