// TEST-ONLY. A stand-in for localStorage that remembers every call, and can be told to
// fail, so tests can check exactly what the save code touches and how it copes.
export class MemoryStorage {
  // failGet / failSet: a list of keys that throw, or '*' for every key.
  constructor(initial = {}, { failGet = [], failSet = [] } = {}) {
    this.data = new Map(Object.entries(initial));
    this.calls = []; // [['get' | 'set', key], ...]
    this.failGet = failGet;
    this.failSet = failSet;
  }

  fails(list, key) {
    return list === '*' || list.includes(key);
  }

  getItem(key) {
    this.calls.push(['get', key]);
    if (this.fails(this.failGet, key)) throw new Error(`storage read blocked for ${key}`);
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    this.calls.push(['set', key]);
    if (this.fails(this.failSet, key)) throw new Error(`QuotaExceededError for ${key}`);
    this.data.set(key, String(value));
  }

  removeItem(key) {
    this.data.delete(key);
  }

  keys() {
    return [...this.data.keys()].sort();
  }

  writesTo(key) {
    return this.calls.filter(([kind, k]) => kind === 'set' && k === key).length;
  }

  touched(key) {
    return this.calls.some(([, k]) => k === key);
  }
}
