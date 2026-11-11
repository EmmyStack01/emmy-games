// TEST-ONLY. Stand-ins for everything the real MissionSystem touches that needs a browser:
// a Phaser scene (game objects that only remember what was done to them), the player, the
// camera, and the DOM mission UI. The mission rules, the save system and GameState are the
// REAL code; only the screen and the page are faked.

import { SPEECH_LAYOUT, placeSpeechBubble } from '../../src/ui/speechPlacement.js';

function makeImage(scene, x, y, key) {
  const image = {
    x,
    y,
    key,
    depth: 0,
    visible: true,
    destroyed: false,
    alpha: 1,
    scale: 1,
    textureKey: key, // the picture currently shown (changes with setTexture; `key` stays as created)
    setOrigin: () => image,
    setAlpha(alpha) {
      image.alpha = alpha;
      return image;
    },
    setScale(scale) {
      image.scale = scale;
      return image;
    },
    setTexture(textureKey) {
      image.textureKey = textureKey;
      return image;
    },
    setDepth(depth) {
      image.depth = depth;
      return image;
    },
    setVisible(visible) {
      image.visible = visible;
      return image;
    },
    setPosition(nx, ny) {
      image.x = nx;
      image.y = ny;
      return image;
    },
    destroy() {
      image.destroyed = true;
    },
  };
  scene.images.push(image);
  return image;
}

// cameraEvents: true gives the camera on / off / emit, like Phaser's (the game positions the speech
// bubble from its "prerender" event); without it the camera has no events, like the older stand-in.
export function makeMissionScene({ cameraEvents = false } = {}) {
  const scene = {
    images: [],
    popups: [],
    soundCalls: 0, // the game has no audio yet; anything that tried to play a sound would count here
    camera: { width: 800, height: 600, zoom: 1, worldView: { x: 0, y: 0 } },
    image: (key) => scene.images.find((i) => i.key === key),
    textures: { exists: () => true }, // textures are "already made", so nothing is drawn
    tweenList: [],
    tweens: {
      // a tween that remembers whether it was paused (the job marker's bobbing is stopped and restarted)
      add: (config) => {
        const tween = {
          config,
          paused: false,
          pause() {
            tween.paused = true;
            return tween;
          },
          resume() {
            tween.paused = false;
            return tween;
          },
        };
        scene.tweenList.push(tween);
        return tween;
      },
    },
    sound: {
      play: () => {
        scene.soundCalls += 1;
      },
    },
    add: {
      image: (x, y, key) => makeImage(scene, x, y, key),
      text: (x, y, text) => {
        const popup = {
          x,
          y,
          text,
          destroyed: false,
          setOrigin: () => popup,
          setDepth: () => popup,
          destroy() {
            popup.destroyed = true;
          },
        };
        scene.popups.push(popup);
        return popup;
      },
    },
  };
  if (cameraEvents) {
    const listeners = new Map();
    scene.camera.on = (name, handler) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
    };
    scene.camera.off = (name, handler) => listeners.get(name)?.delete(handler);
    scene.camera.emit = (name) => listeners.get(name)?.forEach((handler) => handler());
    scene.camera.listenerCount = (name) => listeners.get(name)?.size ?? 0;
  }
  scene.cameras = { main: scene.camera };
  return scene;
}

export function makePlayer(x = 100, y = 100) {
  return { x, y, depth: 100, inputLocked: false };
}

// A UI that records what the mission asked it to show.
export function makeFakeUI() {
  let handlers = {};
  const ui = {
    offerOpen: false,
    offerText: null,
    objective: null, // { text, kind } or null
    toasts: [],
    arrow: null, // { x, y, angle, kind } or null
    destroyed: false,
    setObjective(text, kind) {
      ui.objective = text ? { text, kind } : null;
    },
    replayPrompt: null, // { title } while the "Replay mission" prompt is showing
    showReplayPrompt(title) {
      ui.replayPrompt = { title };
    },
    hideReplayPrompt() {
      ui.replayPrompt = null;
    },
    replay: () => handlers.onReplay(), // the player taps the prompt (or presses E)
    showOffer(text) {
      ui.offerOpen = true;
      ui.offerText = text; // the text of the mission being offered
    },
    hideOffer() {
      ui.offerOpen = false;
    },
    showToast(title, body, kind) {
      ui.toasts.push({ title, body, kind });
    },
    speech: null, // { text } while a speech bubble is showing
    speechLog: [], // every line shown, in order
    speechSpot: null, // the last spot the bubble was placed at
    speechPlacements: 0, // how many times it was placed
    // What the greeting check should assume about the bubble and the screen: { width, height, insets,
    // joystick }. Anything left out is what the real UI uses when it cannot measure (220 x 48, no insets,
    // no joystick).
    speechLayout: {},
    canPlaceCalls: [], // every greeting check: { text, spot }
    canPlaceSpeech(text, spot) {
      ui.canPlaceCalls.push({ text, spot });
      const layout = { width: SPEECH_LAYOUT.FALLBACK_WIDTH, height: SPEECH_LAYOUT.FALLBACK_HEIGHT, ...ui.speechLayout };
      return placeSpeechBubble({ ...spot, ...layout }).fits;
    },
    showSpeech(text) {
      ui.speech = { text };
      ui.speechLog.push(text);
    },
    placeSpeech(spot) {
      ui.speechSpot = spot;
      ui.speechPlacements += 1;
    },
    hideSpeech() {
      ui.speech = null;
    },
    tapSpeech: () => handlers.onSpeechDismiss(), // the player taps the bubble
    showArrow(x, y, angle, kind) {
      ui.arrow = { x, y, angle, kind };
    },
    hideArrow() {
      ui.arrow = null;
    },
    destroy() {
      ui.destroyed = true;
    },
    accept: () => handlers.onAccept(),
    decline: () => handlers.onDecline(),
  };
  const createUI = (given) => {
    handlers = given;
    return ui;
  };
  return { ui, createUI };
}
