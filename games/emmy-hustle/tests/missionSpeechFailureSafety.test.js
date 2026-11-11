// Stage 4B-2, MANDATORY: speech is presentation only. A speech UI that fails (throws, or is simply
// missing) must never stop a mission completing, paying its reward once, saving, or announcing the
// delivery. Real: MissionSystem, MissionFlow, the save system, GameState. Faked: the scene, the
// camera, and a speech UI that fails on purpose.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import MissionSystem from '../src/missions/MissionSystem.js';
import { getSaveManager, startSaveSystem } from '../src/state/saveSystem.js';
import { MISSIONS } from '../src/missions/missionData.js';
import { getCustomerLine, DIALOGUE_KIND } from '../src/missions/customerDialogue.js';
import { makeMissionScene, makePlayer, makeFakeUI } from './support/fakeMissionScene.js';
import { installFakeDom } from './support/fakeDom.js';
import {
  FAR, settle, door, pick, cust, storageWith, savedMain, launch, accept, startMoney, gameState,
} from './support/missionGame.js';

const [M1] = MISSIONS;
let games = [];
let warn = null;
beforeEach(() => {
  warn = mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  games.forEach((game) => game.close());
  games = [];
  mock.restoreAll();
});

const boom = (name) => () => {
  throw new Error(`${name} boom`);
};
const speechWarnings = () => warn.mock.calls.filter(({ arguments: args }) => String(args[0]).includes('A speech bubble failed'));

// the ways the speech UI can fail
const FAILURES = {
  'showSpeech throws': (ui) => {
    ui.showSpeech = boom('showSpeech');
  },
  'placeSpeech throws': (ui) => {
    ui.placeSpeech = boom('placeSpeech');
  },
  'hideSpeech throws': (ui) => {
    ui.hideSpeech = boom('hideSpeech');
  },
  'the speech element does not exist (the methods are missing)': (ui) => {
    ui.showSpeech = undefined;
    ui.placeSpeech = undefined;
    ui.hideSpeech = undefined;
  },
  'every speech call throws': (ui) => {
    ui.showSpeech = boom('showSpeech');
    ui.placeSpeech = boom('placeSpeech');
    ui.hideSpeech = boom('hideSpeech');
  },
};

function launchBroken(fail, options) {
  const storage = storageWith();
  const game = launch(storage, options);
  games.push(game);
  fail(game.ui);
  const markDirty = mock.method(getSaveManager(), 'markDirty');
  return { game, storage, markDirty };
}

// Walk up to the customer (the greeting is attempted here), then deliver.
function deliverWithSpeechBroken(game) {
  accept(game, M1);
  game.at(pick(M1));
  game.scene.camera.worldView = { x: M1.customer.x - 400, y: M1.customer.y - 250 }; // the customer is in view
  game.at({ x: M1.customer.x - 400, y: M1.customer.y });
  game.at({ x: M1.customer.x - 150, y: M1.customer.y }); // greeting attempted
  game.at(cust(M1)); // delivery completes; the reply is attempted
}

for (const cameraEvents of [false, true]) {
  const path = cameraEvents ? 'bubble placed from the camera event' : 'bubble placed by update()';

  describe(`a failing speech UI cannot interrupt a delivery (${path})`, () => {
    for (const [name, fail] of Object.entries(FAILURES)) {
      test(name, async () => {
        const { game, storage, markDirty } = launchBroken(fail, { cameraEvents });
        const savesBefore = markDirty.mock.callCount();

        assert.doesNotThrow(() => deliverWithSpeechBroken(game));

        // 1. the mission entered DONE
        assert.equal(game.state(M1.id), 'done');
        // 2. the reward was paid, exactly once
        assert.deepEqual(game.moneyEvents, [M1.reward]);
        assert.equal(gameState.money, startMoney + M1.reward);
        // 3. a save was requested for the delivery, and the saved file holds the reward and the progress
        assert.ok(markDirty.mock.callCount() > savesBefore, 'a save was requested');
        await settle();
        assert.equal(savedMain(storage).money, startMoney + M1.reward);
        assert.equal(savedMain(storage).missions[M1.id].completed, 1);
        assert.equal(savedMain(storage).missions[M1.id].lastPaidRunId, 1);
        // 4. the "delivery completed" banner still appeared
        assert.deepEqual(game.ui.toasts.at(-1), { title: M1.text.doneTitle, body: M1.text.doneBody, kind: 'done' });
        // the "done" state's other work happened too
        assert.equal(game.ui.objective, null);
        assert.equal(game.view(M1.id).customerArrow.visible, false);

        // duplicate completion cannot pay twice, even with the speech UI failing on every frame
        for (let i = 0; i < 10; i += 1) game.at(cust(M1), 50);
        assert.equal(game.system.flow.complete(), false);
        assert.deepEqual(game.moneyEvents, [M1.reward]);
        assert.equal(gameState.money, startMoney + M1.reward);

        // the camera event (which runs inside Phaser's render loop) never throws out of it
        if (cameraEvents) assert.doesNotThrow(() => game.scene.camera.emit('prerender'));

        // 5. the system is still usable: the window ends, and the job can be played and paid again
        game.waitDone();
        assert.equal(game.state(M1.id), 'available');
        assert.doesNotThrow(() => deliverWithSpeechBroken(game));
        assert.equal(game.state(M1.id), 'done');
        assert.deepEqual(game.moneyEvents, [M1.reward, M1.reward]);
        assert.equal(game.flow(M1.id).completed, 2);
        assert.equal(gameState.money, startMoney + M1.reward * 2);

        // the failure was reported, not silently swallowed
        assert.ok(speechWarnings().length >= 1, 'the failure was logged');
        assert.doesNotThrow(() => game.system.destroy());
      });
    }
  });
}

describe('failure handling: details', () => {
  test('a greeting that fails counts as shown: it is not retried every frame', () => {
    const { game } = launchBroken((ui) => {
      ui.showSpeech = mock.fn(boom('showSpeech'));
    });
    accept(game, M1);
    game.at(pick(M1));
    game.scene.camera.worldView = { x: M1.customer.x - 400, y: M1.customer.y - 250 };
    game.at({ x: M1.customer.x - 400, y: M1.customer.y });
    for (let i = 0; i < 30; i += 1) game.at({ x: M1.customer.x - 150, y: M1.customer.y }, 50);
    assert.equal(game.ui.showSpeech.mock.callCount(), 1);
    assert.equal(speechWarnings().length, 1);
    assert.equal(game.state(M1.id), 'deliver');
  });

  test('a failed line is dropped, and the next line still works', () => {
    const { game } = launchBroken((ui) => {
      const working = ui.showSpeech;
      let first = true;
      ui.showSpeech = (text) => {
        if (first) {
          first = false;
          throw new Error('only the greeting fails');
        }
        working(text);
      };
    });
    deliverWithSpeechBroken(game);
    assert.equal(game.state(M1.id), 'done');
    assert.equal(game.ui.speech?.text, getCustomerLine(M1.id, DIALOGUE_KIND.FIRST_DELIVERY));
    assert.equal(speechWarnings().length, 1);
  });

  test('the guard covers speech only: an error from anything else is not swallowed', () => {
    const { game } = launchBroken(() => {});
    accept(game, M1);
    game.at(pick(M1));
    game.ui.showToast = boom('showToast');
    assert.throws(() => game.at(cust(M1)), /showToast boom/);
  });

  test('cleanup errors do not stop the scene: destroy finishes everything else', () => {
    const { game } = launchBroken(FAILURES['every speech call throws'], { cameraEvents: true });
    game.scene.camera.off = boom('camera.off');
    deliverWithSpeechBroken(game);
    game.player.inputLocked = true;
    assert.doesNotThrow(() => game.system.destroy());
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.ui.destroyed, true);
    assert.equal(game.scene.image('pkg').destroyed, true);
    assert.equal(game.system.speech, null);
  });

  test('a camera whose event hook fails does not stop the game from starting; the bubble is then placed by update()', () => {
    startSaveSystem({ storage: storageWith() });
    const scene = makeMissionScene();
    scene.camera.on = boom('camera.on');
    const player = makePlayer(FAR.x, FAR.y);
    const { ui, createUI } = makeFakeUI();
    let system = null;
    assert.doesNotThrow(() => {
      system = new MissionSystem(scene, player, undefined, { createUI });
    });
    assert.equal(system.handlePreRender, null, 'no listener is remembered when none was added');
    assert.equal(speechWarnings().length, 1);
    // it still plays, and still speaks
    scene.camera.worldView = { x: M1.customer.x - 400, y: M1.customer.y - 250 };
    const at = (point) => {
      player.x = point.x;
      player.y = point.y;
      system.update(0, 16);
    };
    at(FAR);
    at(door(M1));
    ui.accept();
    at(pick(M1));
    at({ x: M1.customer.x - 400, y: M1.customer.y });
    at({ x: M1.customer.x - 150, y: M1.customer.y });
    assert.equal(ui.speech?.text, getCustomerLine(M1.id, DIALOGUE_KIND.GREETING));
    assert.ok(ui.speechPlacements >= 1);
    assert.doesNotThrow(() => system.destroy());
  });

  test('a stand-in camera with no events at all is fine, and so is a scene with no camera list', () => {
    startSaveSystem({ storage: storageWith() });
    const scene = makeMissionScene();
    scene.cameras = {};
    const { createUI } = makeFakeUI();
    assert.doesNotThrow(() => new MissionSystem(scene, makePlayer(FAR.x, FAR.y), undefined, { createUI }).destroy());
  });
});

describe('failure safety with the REAL MissionUI', () => {
  let dom = null;
  let systems = [];
  beforeEach(() => {
    dom = installFakeDom();
  });
  afterEach(() => {
    systems.forEach((system) => system.destroy());
    systems = [];
    dom.restore();
  });

  function build() {
    startSaveSystem({ storage: storageWith() });
    const scene = makeMissionScene();
    const player = makePlayer(FAR.x, FAR.y);
    const system = new MissionSystem(scene, player); // exactly as GameScene builds it
    systems.push(system);
    let time = 0;
    const at = (point, dt = 16) => {
      player.x = point.x;
      player.y = point.y;
      time += dt;
      system.update(time, dt);
    };
    return { system, scene, at };
  }

  test('a missing speech element in the page cannot stop the delivery, the reward or the banner', () => {
    const { system, scene, at } = build();
    system.ui.speech = null; // the DOM element is gone
    system.ui.speechText = null;
    at(FAR);
    at(door(M1));
    system.ui.onAccept();
    at(pick(M1));
    scene.camera.worldView = { x: M1.customer.x - 400, y: M1.customer.y - 250 };
    at({ x: M1.customer.x - 400, y: M1.customer.y });
    assert.doesNotThrow(() => at({ x: M1.customer.x - 150, y: M1.customer.y })); // greeting: fails quietly
    assert.doesNotThrow(() => at(cust(M1)));
    assert.equal(system.flow.state, 'done');
    assert.equal(gameState.money, startMoney + M1.reward);
    assert.equal(system.ui.toastTitle.textContent, M1.text.doneTitle);
    assert.ok(system.ui.toast.classList.contains('show'));
    assert.ok(speechWarnings().length >= 1);
  });
});
