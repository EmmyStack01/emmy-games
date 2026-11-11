// TEST-ONLY. Loaded by "npm test" (node --import ...) before any test file runs.
import { register } from 'node:module';

register('./stub-phaser-hooks.mjs', import.meta.url);
