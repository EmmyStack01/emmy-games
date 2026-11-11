// src/state/SaveManager.js with a fake storage, a fake game state and a manual
// scheduler, so every load/save/recovery path can be checked in plain Node.

import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import SaveManager from '../src/state/SaveManager.js';
import { SAVE_KEYS, SAVE_VERSION, createDefaultSave, parseSave } from '../src/state/saveSchema.js';
import { MemoryStorage } from './support/memoryStorage.js';

const SETTINGS_KEY = 'emmys-hustle:settings:v1';
const CONTEXT = { coinIds: ['c01', 'c02', 'c03'], missionIds: ['firstDelivery'] };
const SETTINGS_VALUE = JSON.stringify({ joystickSide: 'left' });

const saveText = (overrides = {}) =>
  JSON.stringify({ ...createDefaultSave(500, CONTEXT.missionIds), savedAt: 1000, ...overrides });

// A stand-in for GameState with the same four methods the SaveManager uses.
function fakeGameState() {
  const state = new EventEmitter();
  state.money = null;
  state.collected = null;
  state.hydrate = ({ money, collectedCoins }) => {
    state.money = money;
    state.collected = { ...collectedCoins };
  };
  state.snapshotProgress = () => ({ money: state.money, collectedCoins: { ...state.collected } });
  state.collect = (id, value, at = 5) => {
    state.collected[id] = at;
    state.money += value;
    state.emit('progress-changed');
  };
  return state;
}

function setup(initial = {}, storageOptions = {}, extra = {}) {
  const storage = new MemoryStorage({ [SETTINGS_KEY]: SETTINGS_VALUE, ...initial }, storageOptions);
  const warnings = [];
  const queue = [];
  let clock = 5000;
  const manager = new SaveManager({
    storage: 'storage' in extra ? extra.storage : storage,
    context: CONTEXT,
    startMoney: 500,
    now: () => clock,
    schedule: (fn) => queue.push(fn),
    log: { warn: (...args) => warnings.push(args) },
  });
  const game = fakeGameState();
  const run = () => queue.splice(0).forEach((fn) => fn());
  const start = () => {
    manager.load();
    manager.attach(game);
    storage.calls.length = 0; // from here on, only count what the game does
  };
  return { storage, manager, game, warnings, queue, run, start, setClock: (t) => { clock = t; } };
}

const mainSave = (storage) => parseSave(storage.getItem(SAVE_KEYS.main), CONTEXT);
const corruptSlot = (storage) => JSON.parse(storage.data.get(SAVE_KEYS.corrupt)).entries;

describe('a brand-new game', () => {
  test('starts with the starting money and no coins, and writes nothing yet', () => {
    const { storage, manager, game, queue } = setup();
    const status = manager.load();
    manager.attach(game);
    assert.equal(status.source, 'new');
    assert.equal(status.readOnly, false);
    assert.equal(game.money, 500);
    assert.deepEqual(game.collected, {});
    assert.deepEqual(storage.keys(), [SETTINGS_KEY]);
    assert.equal(queue.length, 0);
  });
});

describe('saving', () => {
  test('a coin collected is written with the updated money, in the main key', () => {
    const { storage, game, start, run, setClock } = setup();
    start();
    setClock(7777);
    game.collect('c01', 50, 4242);
    run();
    const result = mainSave(storage);
    assert.equal(result.ok, true);
    assert.equal(result.save.money, 550);
    assert.deepEqual(result.save.coins.collected, { c01: 4242 });
    assert.equal(result.save.savedAt, 7777);
    assert.equal(result.save.v, SAVE_VERSION);
  });

  test('the first write has no backup; the second write backs up the first', () => {
    const { storage, game, start, run } = setup();
    start();
    game.collect('c01', 50);
    run();
    assert.equal(storage.getItem(SAVE_KEYS.backup), null);
    const first = storage.getItem(SAVE_KEYS.main);

    game.collect('c02', 50);
    run();
    assert.equal(storage.getItem(SAVE_KEYS.backup), first);
    assert.equal(mainSave(storage).save.money, 600);
  });

  test('many changes in the same moment are written once', () => {
    const { storage, game, start, run, queue } = setup();
    start();
    game.collect('c01', 50);
    game.collect('c02', 50);
    game.collect('c03', 50);
    assert.equal(queue.length, 1);
    run();
    assert.equal(storage.writesTo(SAVE_KEYS.main), 1);
    const { save } = mainSave(storage);
    assert.equal(save.money, 650);
    assert.deepEqual(Object.keys(save.coins.collected).sort(), ['c01', 'c02', 'c03']);
  });

  test('loading progress into the game does not itself trigger a save', () => {
    const { storage, manager, game, queue } = setup({ [SAVE_KEYS.main]: saveText({ money: 700 }) });
    manager.load();
    manager.attach(game);
    assert.equal(queue.length, 0);
    assert.equal(storage.writesTo(SAVE_KEYS.main), 0);
  });

  test('detach stops saving', () => {
    const { storage, manager, game, start, run } = setup();
    start();
    manager.detach();
    game.collect('c01', 50);
    run();
    assert.equal(storage.writesTo(SAVE_KEYS.main), 0);
  });
});

describe('loading a good save', () => {
  test('hands money and collected coins to the game', () => {
    const raw = saveText({ money: 650, coins: { collected: { c01: 11, c03: 33 } } });
    const { manager, game } = setup({ [SAVE_KEYS.main]: raw });
    const status = manager.load();
    manager.attach(game);
    assert.equal(status.source, 'main');
    assert.equal(game.money, 650);
    assert.deepEqual(game.collected, { c01: 11, c03: 33 });
  });

  test('coins that no longer exist are dropped, and the cleaned save is written next time', () => {
    const raw = saveText({ money: 550, coins: { collected: { c01: 1, retired: 2 } } });
    const { storage, manager, game, warnings, run } = setup({ [SAVE_KEYS.main]: raw });
    manager.load();
    manager.attach(game);
    assert.deepEqual(game.collected, { c01: 1 });
    assert.ok(warnings.some((w) => String(w[0]).includes('retired')));
    game.collect('c02', 50);
    run();
    assert.deepEqual(Object.keys(mainSave(storage).save.coins.collected).sort(), ['c01', 'c02']);
  });

  test('the missions section is carried through exactly as it was loaded', () => {
    const missions = { firstDelivery: { state: 'deliver', runId: 4, completed: 3, lastPaidRunId: 3 } };
    const { storage, manager, game, run } = setup({ [SAVE_KEYS.main]: saveText({ missions }) });
    manager.load();
    manager.attach(game);
    game.collect('c01', 50);
    run();
    assert.deepEqual(mainSave(storage).save.missions, missions);
  });
});

describe('recovering from a damaged main save', () => {
  const BAD_MAIN = '{"v":1,"money":';
  const goodBackup = () => saveText({ money: 600, coins: { collected: { c01: 1, c02: 2 } }, savedAt: 900 });

  test('uses the backup, keeps a copy of the damaged text, and repairs the main key', () => {
    const { storage, manager, game, warnings } = setup({ [SAVE_KEYS.main]: BAD_MAIN, [SAVE_KEYS.backup]: goodBackup() });
    const status = manager.load();
    manager.attach(game);

    assert.equal(status.source, 'backup');
    assert.equal(game.money, 600);
    assert.deepEqual(Object.keys(game.collected).sort(), ['c01', 'c02']);
    assert.equal(corruptSlot(storage)[0].raw, BAD_MAIN);
    assert.equal(corruptSlot(storage)[0].key, 'main');
    assert.equal(corruptSlot(storage)[0].reason, 'not-json');
    assert.equal(mainSave(storage).ok, true);
    assert.equal(mainSave(storage).save.money, 600);
    assert.ok(warnings.length > 0);
  });

  test('a main save with a bad value is treated the same way', () => {
    const bad = saveText({ money: 'a lot' });
    const { storage, manager, game } = setup({ [SAVE_KEYS.main]: bad, [SAVE_KEYS.backup]: goodBackup() });
    assert.equal(manager.load().source, 'backup');
    manager.attach(game);
    assert.equal(game.money, 600);
    assert.equal(corruptSlot(storage)[0].raw, bad);
    assert.equal(corruptSlot(storage)[0].reason, 'invalid');
  });

  test('a missing main save with a good backup restores from the backup quietly', () => {
    const { storage, manager, game, warnings } = setup({ [SAVE_KEYS.backup]: goodBackup() });
    assert.equal(manager.load().source, 'backup');
    manager.attach(game);
    assert.equal(game.money, 600);
    assert.equal(storage.data.has(SAVE_KEYS.corrupt), false);
    assert.equal(mainSave(storage).ok, true);
    assert.equal(warnings.length, 0);
  });

  test('both damaged: starts a new game, and keeps both damaged texts', () => {
    const badBackup = 'not a save';
    const { storage, manager, game } = setup({ [SAVE_KEYS.main]: BAD_MAIN, [SAVE_KEYS.backup]: badBackup });
    const status = manager.load();
    manager.attach(game);
    assert.equal(status.source, 'new');
    assert.equal(status.readOnly, false);
    assert.equal(game.money, 500);
    assert.deepEqual(game.collected, {});
    const raws = corruptSlot(storage).map((entry) => entry.raw);
    assert.ok(raws.includes(BAD_MAIN) && raws.includes(badBackup));
    assert.equal(storage.getItem(SAVE_KEYS.main), BAD_MAIN, 'nothing overwrites the damaged main until progress is made');
  });

  test('after a fresh start the game saves normally, and the damaged copies stay kept', () => {
    const { storage, manager, game, run } = setup({ [SAVE_KEYS.main]: BAD_MAIN });
    manager.load();
    manager.attach(game);
    game.collect('c01', 50);
    run();
    assert.equal(mainSave(storage).ok, true);
    assert.equal(mainSave(storage).save.money, 550);
    assert.equal(corruptSlot(storage)[0].raw, BAD_MAIN);
    assert.equal(storage.getItem(SAVE_KEYS.backup), null, 'a damaged main is never copied into the backup');
  });

  test('the same damaged text is not kept twice across reloads', () => {
    const { storage, manager } = setup({ [SAVE_KEYS.main]: BAD_MAIN });
    manager.load();
    manager.load();
    manager.load();
    assert.equal(corruptSlot(storage).length, 1);
  });

  test('only the newest few damaged copies are kept', () => {
    const { storage, manager } = setup();
    ['one', 'two', 'three', 'four', 'five'].forEach((raw) => {
      storage.setItem(SAVE_KEYS.main, `garbage ${raw}`);
      manager.load();
    });
    const raws = corruptSlot(storage).map((entry) => entry.raw);
    assert.deepEqual(raws, ['garbage five', 'garbage four', 'garbage three']);
  });

  test('a huge damaged value is kept truncated, and marked as such', () => {
    const huge = 'x'.repeat(150_000);
    const { storage, manager } = setup({ [SAVE_KEYS.main]: huge });
    manager.load();
    const [entry] = corruptSlot(storage);
    assert.equal(entry.raw.length, 100_000);
    assert.equal(entry.truncated, true);
  });

  test('if the damaged text cannot be kept safe, nothing is ever overwritten', () => {
    const { storage, manager, game, warnings, start, run } = setup(
      { [SAVE_KEYS.main]: BAD_MAIN },
      { failSet: [SAVE_KEYS.corrupt] }
    );
    start();
    assert.equal(manager.getStatus().readOnly, true);
    assert.equal(manager.getStatus().readOnlyReason, 'could-not-preserve');
    game.collect('c01', 50);
    run();
    assert.equal(storage.getItem(SAVE_KEYS.main), BAD_MAIN);
    assert.equal(storage.writesTo(SAVE_KEYS.main), 0);
    assert.ok(warnings.length > 0);
  });

  test('a damaged backup next to a good main does not stop saving, even if it cannot be kept', () => {
    const { storage, manager, game, start, run } = setup(
      { [SAVE_KEYS.main]: saveText({ money: 700 }), [SAVE_KEYS.backup]: 'garbage' },
      { failSet: [SAVE_KEYS.corrupt] }
    );
    start();
    assert.equal(manager.getStatus().readOnly, false);
    assert.equal(game.money, 700);
    game.collect('c01', 50);
    run();
    assert.equal(mainSave(storage).save.money, 750);
  });
});

describe('a save from a newer version of the game', () => {
  const NEWER = JSON.stringify({ v: SAVE_VERSION + 1, money: 99999, extra: 'from the future' });

  test('is never overwritten: saving is switched off, and the game still runs', () => {
    const { storage, manager, game, warnings, start, run } = setup({ [SAVE_KEYS.main]: NEWER });
    start();
    assert.equal(manager.getStatus().readOnly, true);
    assert.equal(manager.getStatus().readOnlyReason, 'newer-version');
    assert.equal(game.money, 500);
    game.collect('c01', 50);
    run();
    assert.equal(game.money, 550);
    assert.equal(storage.getItem(SAVE_KEYS.main), NEWER);
    assert.equal(storage.writesTo(SAVE_KEYS.main), 0);
    assert.equal(storage.writesTo(SAVE_KEYS.backup), 0);
    assert.equal(storage.data.has(SAVE_KEYS.corrupt), false);
    assert.ok(warnings.length > 0);
  });

  test('a newer backup protects itself too, even beside a good main', () => {
    const { storage, manager, game, start, run } = setup({
      [SAVE_KEYS.main]: saveText({ money: 700 }),
      [SAVE_KEYS.backup]: NEWER,
    });
    start();
    assert.equal(manager.getStatus().readOnlyReason, 'newer-version');
    assert.equal(game.money, 700);
    game.collect('c01', 50);
    run();
    assert.equal(storage.getItem(SAVE_KEYS.backup), NEWER);
    assert.equal(mainSave(storage).save.money, 700);
  });
});

describe('storage that is missing, blocked or full', () => {
  test('no storage at all: the game runs, nothing throws', () => {
    const { manager, game, warnings, run } = setup({}, {}, { storage: null });
    manager.load();
    manager.attach(game);
    assert.equal(manager.getStatus().readOnlyReason, 'no-storage');
    assert.equal(game.money, 500);
    assert.doesNotThrow(() => {
      game.collect('c01', 50);
      run();
    });
    assert.equal(game.money, 550);
    assert.ok(warnings.length > 0);
  });

  test('storage that cannot be read: the game runs, nothing throws', () => {
    const { manager, game, run } = setup({}, { failGet: '*' });
    assert.doesNotThrow(() => {
      manager.load();
      manager.attach(game);
      game.collect('c01', 50);
      run();
    });
    assert.equal(manager.getStatus().readOnlyReason, 'storage-unreadable');
    assert.equal(game.money, 550);
  });

  test('a full or blocked write is survived, and saving works again once storage recovers', () => {
    const { storage, manager, game, warnings, start, run } = setup({}, { failSet: [SAVE_KEYS.main] });
    start();
    assert.doesNotThrow(() => {
      game.collect('c01', 50);
      run();
    });
    assert.equal(game.money, 550);
    assert.equal(storage.data.has(SAVE_KEYS.main), false);
    assert.ok(warnings.length > 0);

    storage.failSet = [];
    game.collect('c02', 50);
    run();
    const { save } = mainSave(storage);
    assert.equal(save.money, 600);
    assert.deepEqual(Object.keys(save.coins.collected).sort(), ['c01', 'c02']);
    assert.equal(manager.getStatus().readOnly, false);
  });

  test('a save that cannot be built (money out of range) is refused, not written', () => {
    const { storage, game, warnings, start, run } = setup();
    start();
    game.money = -5;
    game.emit('progress-changed');
    assert.doesNotThrow(run);
    assert.equal(storage.data.has(SAVE_KEYS.main), false);
    assert.ok(warnings.length > 0);
  });
});

describe('the default scheduler and clock', () => {
  test('work even when queueMicrotask insists on being called as a plain function, as in browsers', async () => {
    const real = globalThis.queueMicrotask;
    mock.method(globalThis, 'queueMicrotask', function strictQueueMicrotask(task) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return real(task);
    });
    try {
      const storage = new MemoryStorage();
      const manager = new SaveManager({ storage, context: CONTEXT, startMoney: 500, log: { warn() {} } });
      const game = fakeGameState();
      manager.load();
      manager.attach(game);
      game.collect('c01', 50);
      await new Promise((resolve) => setImmediate(resolve));
      const { ok, save } = parseSave(storage.getItem(SAVE_KEYS.main), CONTEXT);
      assert.equal(ok, true);
      assert.equal(save.money, 550);
      assert.ok(save.savedAt > 1_700_000_000_000, 'the real clock is used by default');
    } finally {
      mock.restoreAll();
    }
  });
});

describe('start-up mistakes are loud, load-time problems are not', () => {
  test('a bad context or start amount throws when the manager is created', () => {
    const make = (context, startMoney = 500) => () =>
      new SaveManager({ storage: new MemoryStorage(), context, startMoney, log: { warn() {} } });
    assert.throws(make({ coinIds: ['a', 'a'], missionIds: [] }), /duplicate/);
    assert.throws(make({ coinIds: [], missionIds: [] }, -1), TypeError);
    assert.doesNotThrow(make({ coinIds: ['a'], missionIds: ['m'] }));
  });
});

describe('the joystick settings are never touched', () => {
  test('every scenario leaves the settings key unread, unwritten and unchanged', () => {
    const scenarios = [
      {},
      { [SAVE_KEYS.main]: saveText({ money: 600 }) },
      { [SAVE_KEYS.main]: 'garbage', [SAVE_KEYS.backup]: saveText() },
      { [SAVE_KEYS.main]: 'garbage', [SAVE_KEYS.backup]: 'garbage' },
      { [SAVE_KEYS.main]: JSON.stringify({ v: 99 }) },
    ];
    scenarios.forEach((initial) => {
      const { storage, manager, game, run } = setup(initial);
      storage.calls.length = 0;
      manager.load();
      manager.attach(game);
      game.collect('c01', 50);
      run();
      game.collect('c02', 50);
      run();
      assert.equal(storage.touched(SETTINGS_KEY), false, JSON.stringify(Object.keys(initial)));
      assert.equal(storage.getItem(SETTINGS_KEY), SETTINGS_VALUE);
    });
  });
});
