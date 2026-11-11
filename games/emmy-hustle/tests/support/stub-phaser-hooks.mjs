// TEST-ONLY. GameState.js does `import Phaser from 'phaser'` just to extend Phaser's
// event emitter, and Phaser cannot be loaded in plain Node (it needs a browser).
// This loader hook swaps the bare import "phaser" for a tiny stand-in built on Node's
// own EventEmitter, so the real GameState.js and Coins.js can be tested unchanged.
// The game and the Vite build never use this file.

const STUB_URL = 'emmys-hustle-test:phaser-stub';

const STUB_SOURCE = `
import { EventEmitter } from 'node:events';
export default { Events: { EventEmitter } };
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') return { url: STUB_URL, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === STUB_URL) return { format: 'module', source: STUB_SOURCE, shortCircuit: true };
  return nextLoad(url, context);
}
