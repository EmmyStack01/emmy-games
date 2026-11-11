import MissionFlow, { STATES } from './MissionFlow.js';
import MissionUI from '../ui/MissionUI.js';
import MissionView, { MARKER_STYLE } from './MissionView.js';
import { MISSIONS, PLAYABLE_MISSION_IDS, naira } from './missionData.js';
import { isUnlocked, getActiveMissionIds, selectNextObjective, missionStatus, OBJECTIVE, STATUS } from './missionSequence.js';
import { makeMissionTextures } from './missionTextures.js';
import { getCustomerLine, DIALOGUE_KIND } from './customerDialogue.js';
import { getJobNotice, JOB_NOTICE_MS } from './jobNotices.js';
import { WELCOME_MESSAGES } from './welcomeMessages.js';
import { SPEECH_LAYOUT, placeSpeechBubble } from '../ui/speechPlacement.js';
import gameState from '../state/GameState.js';
import { getSaveManager } from '../state/saveSystem.js';
import { FONT_FAMILY } from '../config.js';

// Connects the mission rules (MissionFlow) to the game: floating markers, the customer, the
// package Emmy carries, the on-screen UI, the existing money system and the save file.
//
// There is ONE MissionFlow for every mission in the ordered list, each restored from, and
// saved under, its own permanent id. Only the missions in `playableIds` are shown and
// played (today: The First Delivery); the others have a flow, so their progress is kept and
// saved, but no markers, no offer and no frame updates.
//
// Offers: a NEW job opens its offer card by itself when Emmy walks up to its shop. A job that has
// been delivered before (a replay) never does. Near its shop a small "Replay mission" prompt
// appears instead, and the player chooses (tap, or the E key) to open the same offer card.
//
// The rules this class adds on top of the flows:
//   * Only ONE mission is in progress (pickup or deliver) at a time. While one is, no other
//     mission can offer a job, be accepted or be updated, and only its markers show.
//   * A mission is offered only once it is unlocked (missionSequence.js). Unlocking never
//     accepts it: the player always has to walk to the shop and press Accept.
//   * Restoring a save never pays, never plays a notice. If a damaged save has several
//     missions in progress, the first one in mission order is kept and the rest go back to
//     "available" with their counters untouched.
//
// Speech: the active customer greets Emmy once as she walks up carrying their delivery, and says
// a reply after each delivery (one line for the first, another for every replay). The words live
// in customerDialogue.js. This is presentation only: every call into the speech UI is guarded (see
// guardSpeech), so a failure in it can never stop a mission completing, paying or saving.
//
// New jobs: when a first delivery opens up the next job, the HUD message says so once the
// "delivery completed" window is over, at the same moment the new job's marker and arrow appear
// (see noteNewJob / announceNewJob). Held in memory only: nothing is saved, so loading a game never
// announces a job that was unlocked earlier.
//
// Saving: every flow is bound to the SaveManager (when there is one), so every save carries
// the live progress together with money and coins. Money and coins ask for saves by
// themselves; a mission change does not move any money, so accepting a job and collecting
// the package ask for a save explicitly. Everything is reached through getSaveManager()?.
// so the game plays the same when saving is unavailable.
// The "Replay mission" prompt shows when Emmy is within the shop's offer radius (130 px) and stays
// until she is this much farther away, so it does not flicker at the edge.
const REPLAY_PROMPT_HIDE_MARGIN = 20;

// The objective arrow. Its centre stays at least ARROW_MARGIN_TOP px below the top of the screen (the
// HUD bar and the objective line). The arrow reaches ARROW_REACH px past its centre in any direction
// (18.9 px measured, plus its 1.5 px half-stroke). While a HUD message is showing, the top margin moves
// down to clear it by ARROW_MESSAGE_GAP px (the HUD's own 8 px spacing), but never so far that fewer
// than ARROW_MIN_WINDOW px are left above the bottom margin.
const ARROW_MARGIN_TOP = 120;
const ARROW_REACH = 21;
const ARROW_MESSAGE_GAP = 8;
const ARROW_MIN_WINDOW = 8;

// A customer greets Emmy when she comes within GREETING_RADIUS of them, and can greet again only
// after she has gone beyond the re-arm radius and come back. A greeting stays at most GREETING_MS.
const GREETING_RADIUS = 190;
const GREETING_REARM_RADIUS = GREETING_RADIUS * 1.25; // 237.5
const GREETING_MS = 3500;

// Phaser's camera event (Phaser.Cameras.Scene2D.Events.PRE_RENDER), sent after the camera has
// followed Emmy this frame. The speech bubble is placed then, so it never lags a frame behind.
const CAMERA_PRE_RENDER = 'prerender';

export default class MissionSystem {
  // Normal use: new MissionSystem(scene, player). That runs the whole ordered mission list.
  // `def` (a single definition) is the older single-mission form: it runs just that mission.
  // options.missions / options.playableIds / options.createUI are replaced only in tests
  // (createUI is a stand-in for the DOM UI; the default builds the real MissionUI).
  constructor(scene, player, def, options = {}) {
    this.scene = scene;
    this.player = player;
    this.destroyed = false;

    const defs = def ? [def] : options.missions ?? MISSIONS;
    const playableIds = def ? [def.id] : options.playableIds ?? PLAYABLE_MISSION_IDS;
    if (!Array.isArray(defs) || defs.length === 0) throw new Error('MissionSystem needs at least one mission');
    this.order = defs.map((d) => d.id);
    if (new Set(this.order).size !== this.order.length) throw new Error('MissionSystem: duplicate mission id');
    playableIds.forEach((id) => {
      if (!this.order.includes(id)) throw new Error(`MissionSystem: playable mission "${id}" is not in the list`);
    });
    if (playableIds.length === 0) throw new Error('MissionSystem needs at least one playable mission');

    makeMissionTextures(scene);

    // One unit per mission, in list order: its definition, its flow, and (only if playable)
    // its pictures in the world.
    this.units = defs.map((d) => ({
      def: d,
      flow: null,
      view: playableIds.includes(d.id) ? new MissionView(scene, d) : null,
      playable: playableIds.includes(d.id),
      bound: false,
      greetArmed: false, // this customer's greeting is ready; set by Emmy being far enough away
    }));
    this.unlockedIds = new Set();
    this.newJobId = null; // the first unlocked mission that has never been delivered, if any
    this.replayIds = new Set(); // the missions that have been delivered before (replays)
    this.promptUnit = null; // the mission whose "Replay mission" prompt is showing, if any
    this.speech = null; // the one line being said: { unit, dialogueKind, remainingMs }, or null
    this.greetCheckWarned = false; // a failing greeting check is reported once, not every frame
    this.arrowMarginWarned = false; // so is a failure to keep the arrow clear of the HUD message
    this.pendingNewJob = null; // { after, job }: `job` opened when `after` was delivered; announced when `after` is available again
    this.camera = null;
    this.handlePreRender = null;

    // The package Emmy carries (floats above her head); there is only ever one
    this.package = scene.add.image(0, 0, 'pkg').setOrigin(0.5, 1).setVisible(false);

    const createUI =
      options.createUI ||
      ((handlers) =>
        new MissionUI({
          hud: document.getElementById('hud'),
          app: document.getElementById('app'),
          ...handlers,
        }));
    this.ui = createUI({
      onAccept: () => this.acceptOffer(),
      onDecline: () => this.declineOffer(),
      onReplay: () => this.requestReplay(),
      onSpeechDismiss: () => this.hideSpeech(),
    });
    this.guardSpeech(() => this.hookCamera());

    this.units.forEach((unit) => {
      unit.flow = new MissionFlow(unit.def, {
        onState: (state) => {
          this.applyState(unit, state);
          this.requestSave(state);
        },
        onPackage: (carrying) => this.setCarrying(carrying),
        onReward: (amount) => this.payReward(amount),
      });
    });

    // Put every flow back to its saved progress BEFORE anything is shown or bound.
    // restore() calls no hooks, so nothing is paid here.
    this.units.forEach((unit) => this.restoreProgress(unit));
    const repaired = this.enforceSingleActive();
    this.showRestored();

    // Bound only after restoring, so the first save already holds the restored progress.
    this.units.forEach((unit) => this.bindToSave(unit));
    if (repaired) this.requestSave(STATES.PICKUP); // keep the repaired progress in the next save
  }

  /* ------------------------------------------------------------- the units */

  getUnit(id) {
    return this.units.find((unit) => unit.def.id === id) ?? null;
  }

  getFlow(id) {
    return this.getUnit(id)?.flow ?? null;
  }

  getView(id) {
    return this.getUnit(id)?.view ?? null;
  }

  // The first playable mission. Kept so code written for a single mission (tests, the
  // developer console) still has `system.flow` and `system.def`.
  get primary() {
    return this.units.find((unit) => unit.playable);
  }

  get flow() {
    return this.primary.flow;
  }

  get def() {
    return this.primary.def;
  }

  // True only when every mission's flow is connected to the save system.
  get boundToSave() {
    return this.units.every((unit) => unit.bound);
  }

  // The mission in progress (pickup or deliver), if any. There is never more than one.
  activeUnit() {
    return this.units.find((unit) => unit.playable && unit.flow.isActive) ?? null;
  }

  // A mission that is busy with the player: offer card open, in progress, or "done" showing.
  engagedUnit() {
    return this.units.find((unit) => unit.playable && unit.flow.state !== STATES.AVAILABLE) ?? null;
  }

  offeringUnit() {
    return this.units.find((unit) => unit.playable && unit.flow.state === STATES.OFFER) ?? null;
  }

  // Playable missions that are waiting for the player: unlocked and not started.
  offerableUnits() {
    return this.units.filter(
      (unit) => unit.playable && unit.flow.state === STATES.AVAILABLE && this.unlockedIds.has(unit.def.id),
    );
  }

  // The saved-progress shape of every mission, read from the live flows.
  progressSnapshot() {
    return Object.fromEntries(this.units.map((unit) => [unit.def.id, unit.flow.toSave()]));
  }

  /* ---------------------------------------------------------------- saving */

  // Reads this mission's saved progress and gives it to its flow. A failure here only means
  // the mission starts fresh; it never stops the game from starting.
  restoreProgress(unit) {
    try {
      const saved = getSaveManager()?.getMissionProgress(unit.def.id);
      if (saved) unit.flow.restore(saved);
    } catch (error) {
      console.warn(`[Mission] Saved progress for "${unit.def.id}" could not be restored; starting it fresh.`, error);
    }
  }

  // Only one mission may be in progress. If the restored flows disagree (a damaged or
  // edited save), the first playable, unlocked one in mission order is kept; every other one
  // goes back to "available" with its counters exactly as they were, so no completed progress
  // is lost and no reward can be paid (restore() calls no hooks). A mission that is still
  // locked, or that cannot be played, can never stay in progress. Returns true if it changed anything.
  enforceSingleActive() {
    const keptId =
      getActiveMissionIds(this.order, this.progressSnapshot()).find((id) => this.getUnit(id).playable) ?? null;
    let repaired = false;
    this.units.forEach((unit) => {
      if (!unit.flow.isActive || unit.def.id === keptId) return;
      unit.flow.restore({ ...unit.flow.toSave(), state: STATES.AVAILABLE });
      repaired = true;
    });
    return repaired;
  }

  bindToSave(unit) {
    try {
      unit.bound = getSaveManager()?.bindMission(unit.def.id, unit.flow) === true;
    } catch (error) {
      console.warn(`[Mission] "${unit.def.id}" could not be connected to the save system.`, error);
    }
  }

  // Asks for a save when a mission moved to a state that matters. The write itself is
  // queued, so the reward's money change (which comes right after "done") lands in the
  // SAME write as the mission progress.
  requestSave(state) {
    if (state !== STATES.PICKUP && state !== STATES.DELIVER && state !== STATES.DONE) return;
    try {
      getSaveManager()?.markDirty();
    } catch (error) {
      console.warn('[Mission] A save could not be requested.', error);
    }
  }

  /* ----------------------------------------------------------------- state */

  // What the player sees right after loading: the right markers and objective line, but none
  // of the one-off notices ("PACKAGE COLLECTED!", "DELIVERY COMPLETED!") and no money.
  showRestored() {
    const active = this.activeUnit();
    this.refreshViews();
    this.player.inputLocked = false; // a restored mission is never in the offer state
    this.ui.hideOffer();
    this.showObjective(active);
    this.setCarrying(active?.flow.state === STATES.DELIVER); // still carrying the package
    if (this.package.visible) this.package.setPosition(this.player.x, this.player.y - 72).setDepth(this.player.depth + 1);
  }

  // Shows each mission's pictures for its state. The job marker of a mission stays hidden
  // while it is locked and while another job is in progress; when it is shown, it is bright for
  // a new job and dimmed for a job that has been delivered before (a replay). Unlocked missions
  // are worked out here, whenever a state changes, so the per-frame update has nothing to compute.
  refreshViews() {
    const progress = this.progressSnapshot();
    this.unlockedIds = new Set(this.order.filter((id) => isUnlocked(this.order, progress, id)));
    const next = selectNextObjective(this.order, progress);
    this.newJobId = next.type === OBJECTIVE.NEW_JOB ? next.missionId : null;
    this.replayIds = new Set(this.order.filter((id) => missionStatus(this.order, progress, id) === STATUS.REPEATABLE));
    this.units.forEach((unit) => {
      if (!unit.view) return;
      const busyElsewhere = this.units.some((u) => u !== unit && u.playable && u.flow.state !== STATES.AVAILABLE);
      unit.view.apply(unit.flow.state, {
        markerOpen: this.unlockedIds.has(unit.def.id) && !busyElsewhere,
        markerStyle: this.replayIds.has(unit.def.id) ? MARKER_STYLE.REPEATABLE : MARKER_STYLE.NEW,
      });
    });
  }

  showObjective(unit) {
    const text = unit?.def.text;
    if (unit?.flow.state === STATES.PICKUP) this.ui.setObjective(text.objectivePickup, 'pickup');
    else if (unit?.flow.state === STATES.DELIVER) this.ui.setObjective(text.objectiveDeliver, 'deliver');
    else this.ui.setObjective(null);
  }

  // `unit` just changed to `state`. quiet: true shows the markers and objective line but none
  // of the one-off notices.
  applyState(unit, state, { quiet = false } = {}) {
    const text = unit.def.text;
    const unlockedBefore = this.unlockedIds; // refreshViews() builds a new set, so this one stays as it was
    this.refreshViews();

    // Emmy stands still while the offer card is open
    this.player.inputLocked = state === STATES.OFFER;

    if (state === STATES.OFFER) this.ui.showOffer(text);
    else this.ui.hideOffer();

    switch (state) {
      case STATES.PICKUP:
        this.ui.setObjective(text.objectivePickup, 'pickup');
        break;
      case STATES.DELIVER:
        this.ui.setObjective(text.objectiveDeliver, 'deliver');
        if (!quiet) this.ui.showToast(text.collectedTitle, text.collectedBody, 'pickup', 2800);
        break;
      case STATES.DONE:
        this.ui.setObjective(null);
        if (!quiet) {
          this.ui.showToast(text.doneTitle, text.doneBody, 'done', 3000);
          this.sayDeliveryResponse(unit);
          this.noteNewJob(unit, unlockedBefore);
        }
        break;
      case STATES.AVAILABLE:
        this.ui.setObjective(null);
        this.announceNewJob(unit);
        break;
      default:
        this.ui.setObjective(null);
    }
  }

  // The offer card's buttons. Accept only works for the mission whose card is open, and
  // never while another mission is in progress (the card is simply closed instead).
  acceptOffer() {
    const offering = this.offeringUnit();
    if (!offering) return;
    if (this.units.some((unit) => unit !== offering && unit.playable && unit.flow.isActive)) {
      offering.flow.decline();
      return;
    }
    if (offering.flow.accept()) this.retireWelcome(offering);
  }

  // The first-time welcome says "follow the ! to Lagoon Mart for your first delivery". Once that first
  // job has been accepted it is out of date, so it is taken off the HUD if it is still showing. Only
  // that exact message goes: the HUD ignores the request if anything else is on show (a new-job
  // notice, say), and nothing is queued. Presentation only: a failure is logged and the game carries on.
  retireWelcome(unit) {
    if (unit.def.id !== this.order[0]) return;
    try {
      gameState.clearMessage(WELCOME_MESSAGES.firstMission.text);
    } catch (error) {
      console.warn('[Mission] The welcome message could not be cleared; the mission carries on.', error);
    }
  }

  declineOffer() {
    this.offeringUnit()?.flow.decline();
  }

  /* ----------------------------------------------------------- replays */

  // The replayable mission whose prompt Emmy is close enough to see, if any: nothing else is going
  // on, the mission is waiting and has been delivered before, and Emmy is within its shop's offer
  // radius (130 px), or, if its prompt is already showing, within that radius plus a small margin
  // (so the prompt does not flicker). Shops are far apart, so there is at most one.
  findReplayCandidate() {
    if (this.engagedUnit()) return null;
    const p = this.player;
    let best = null;
    let bestDistance = Infinity;
    this.units.forEach((unit) => {
      if (!unit.playable || unit.flow.state !== STATES.AVAILABLE || !this.replayIds.has(unit.def.id)) return;
      const { door, offerRadius } = unit.def.shop;
      const limit = unit === this.promptUnit ? offerRadius + REPLAY_PROMPT_HIDE_MARGIN : offerRadius;
      const distance = Math.hypot(p.x - door.x, p.y - door.y);
      if (distance <= limit && distance < bestDistance) {
        best = unit;
        bestDistance = distance;
      }
    });
    return best;
  }

  // Shows, switches or hides the "Replay mission" prompt, only when it needs to change.
  updateReplayPrompt() {
    const candidate = this.findReplayCandidate();
    if (candidate === this.promptUnit) return;
    this.promptUnit = candidate;
    if (candidate) this.ui.showReplayPrompt(candidate.def.title);
    else this.ui.hideReplayPrompt();
  }

  // The player tapped the prompt (or pressed E): open the mission's usual offer card. It is checked
  // again first, in case the screen is a moment out of date (Emmy has walked away, or something
  // else has opened). Accept and Not Now then work exactly as they always have.
  requestReplay() {
    const unit = this.promptUnit;
    if (!unit || this.destroyed) return false;
    if (this.findReplayCandidate() !== unit) {
      this.updateReplayPrompt();
      return false;
    }
    this.promptUnit = null;
    this.ui.hideReplayPrompt();
    return unit.flow.openOffer();
  }

  setCarrying(carrying) {
    this.package.setVisible(carrying);
  }

  // The reward goes through the game's one money system, so the HUD updates by itself.
  payReward(amount) {
    gameState.addMoney(amount);

    const p = this.player;
    const popup = this.scene.add
      .text(p.x, p.y - 86, `+${naira(amount)}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#fff3b0',
        stroke: '#141830',
        strokeThickness: 5,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(10000);
    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 40,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.out',
      onComplete: () => popup.destroy(),
    });
  }

  /* ------------------------------------------------------------- new jobs */

  // Called when `unit` has just been delivered. A job that is unlocked now and was not before is
  // genuinely new (it is worked out from the unlocked SETS, not from newJobId, which also changes
  // when an old job is replayed). Only remembered here; it is announced when the delivery window ends.
  noteNewJob(unit, unlockedBefore) {
    const job = this.units.find((u) => u.playable && this.unlockedIds.has(u.def.id) && !unlockedBefore.has(u.def.id));
    this.pendingNewJob = job ? { after: unit, job } : null;
  }

  // Called when `unit` is available again. If it was the delivery that opened a new job, say so,
  // once. A failure in the HUD must never stop the mission going on: the error is logged and the
  // game carries on (other errors are not swallowed here).
  announceNewJob(unit) {
    const pending = this.pendingNewJob;
    if (!pending || pending.after !== unit || this.destroyed) return;
    this.pendingNewJob = null; // used up, whatever happens next
    const notice = getJobNotice(pending.job.def.id);
    if (!notice) return;
    try {
      gameState.say(notice, JOB_NOTICE_MS);
    } catch (error) {
      console.warn('[Mission] The new-job notice failed; the mission carries on.', error);
    }
  }

  /* ---------------------------------------------------------------- speech */

  // Runs one piece of speech presentation. If it fails (a DOM error, a missing element), the
  // failure is logged, the bubble is dropped and the game carries on: the mission rules, the
  // reward and the save never depend on it. Only speech calls go through here; other errors are
  // not swallowed.
  guardSpeech(action) {
    try {
      action();
    } catch (error) {
      console.warn('[Mission] A speech bubble failed; the mission carries on.', error);
      this.speech = null;
      try {
        this.ui.hideSpeech();
      } catch {
        // the bubble itself is what is broken; there is nothing more to do
      }
    }
  }

  // Says one line, replacing whatever is showing (lines are never queued). remainingMs is how long
  // it lasts, or null to last until its mission leaves the "done" state.
  showSpeech(unit, dialogueKind, remainingMs) {
    const text = getCustomerLine(unit.def.id, dialogueKind);
    if (!text) return;
    this.guardSpeech(() => {
      this.speech = { unit, dialogueKind, remainingMs };
      this.ui.showSpeech(text);
      this.positionSpeech();
    });
  }

  hideSpeech() {
    if (!this.speech) return;
    this.speech = null;
    this.guardSpeech(() => this.ui.hideSpeech());
  }

  // After a delivery: the customer's first-delivery line the first time, the replay line after that.
  // (complete() has already counted this delivery by the time the "done" state is announced.)
  sayDeliveryResponse(unit) {
    const dialogueKind = unit.flow.completed >= 2 ? DIALOGUE_KIND.REPLAY : DIALOGUE_KIND.FIRST_DELIVERY;
    this.showSpeech(unit, dialogueKind, null);
  }

  // Where the customer is on the screen: the same projection the objective arrow uses.
  speechSpot(unit) {
    const cam = this.scene.cameras.main;
    const { x, y } = unit.def.customer;
    const feetY = (y - cam.worldView.y) * cam.zoom;
    return {
      x: (x - cam.worldView.x) * cam.zoom,
      feetY,
      anchorY: feetY - SPEECH_LAYOUT.ANCHOR_HEIGHT * cam.zoom,
      viewWidth: cam.width,
      viewHeight: cam.height,
    };
  }

  positionSpeech() {
    const speech = this.speech;
    if (!speech || this.destroyed) return;
    this.guardSpeech(() => this.ui.placeSpeech(this.speechSpot(speech.unit)));
  }

  // The camera event is how the bubble follows the camera. A camera without events (a test
  // stand-in) is fine: update() places the bubble instead.
  hookCamera() {
    const camera = this.scene.cameras?.main;
    if (typeof camera?.on !== 'function') return;
    const handler = () => this.positionSpeech();
    camera.on(CAMERA_PRE_RENDER, handler);
    this.camera = camera; // remembered only once the listener is really in place
    this.handlePreRender = handler;
  }

  unhookCamera() {
    if (this.handlePreRender) this.camera?.off?.(CAMERA_PRE_RENDER, this.handlePreRender);
    this.handlePreRender = null;
    this.camera = null;
  }

  // A greeting ends when its time is up, its mission is no longer being delivered, or an offer opens.
  // A reply ends with the "done" state, which is when the customer leaves. Game time, not timers.
  updateSpeech(dt) {
    const speech = this.speech;
    if (!speech) return;
    if (speech.dialogueKind === DIALOGUE_KIND.GREETING) {
      speech.remainingMs -= dt;
      if (speech.remainingMs <= 0 || speech.unit.flow.state !== STATES.DELIVER || this.offeringUnit()) this.hideSpeech();
    } else if (speech.unit.flow.state !== STATES.DONE) {
      this.hideSpeech();
    }
  }

  // Each customer keeps its own "ready to greet" flag. It is set whenever Emmy is beyond the re-arm
  // radius (and starts unset, so loading a save never greets). Within the greeting radius, only the
  // customer of the mission being DELIVERED greets, once, and only when it can be seen and heard.
  updateGreeting() {
    const p = this.player;
    const active = this.activeUnit();
    this.units.forEach((unit) => {
      if (!unit.playable) return;
      const { x, y } = unit.def.customer;
      const distance = Math.hypot(p.x - x, p.y - y);
      if (distance > GREETING_REARM_RADIUS) {
        unit.greetArmed = true;
        if (this.speech?.unit === unit && this.speech.dialogueKind === DIALOGUE_KIND.GREETING) this.hideSpeech(); // Emmy walked away
      } else if (
        distance <= GREETING_RADIUS &&
        unit === active &&
        unit.flow.state === STATES.DELIVER &&
        unit.greetArmed &&
        this.canGreet(unit)
      ) {
        unit.greetArmed = false; // counts as shown, even if it is tapped away or fails to draw
        this.showSpeech(unit, DIALOGUE_KIND.GREETING, GREETING_MS);
      }
    });
  }

  // Not while an offer card is open or Emmy is held still, and only if the greeting's bubble can really
  // be placed: above or below the customer, inside the screen margins and (on a short landscape
  // screen) clear of the joystick. A customer hidden under the HUD, off the edge or with no room
  // for a bubble is not greeted yet; the greeting stays armed and comes when there is room.
  // This is presentation only: if the check itself fails, there is no greeting and the game goes on.
  canGreet(unit) {
    if (this.player.inputLocked || this.offeringUnit()) return false;
    try {
      const spot = this.speechSpot(unit);
      const text = getCustomerLine(unit.def.id, DIALOGUE_KIND.GREETING);
      if (typeof this.ui.canPlaceSpeech === 'function') return this.ui.canPlaceSpeech(text, spot) === true;
      return placeSpeechBubble({ ...spot, width: SPEECH_LAYOUT.FALLBACK_WIDTH, height: SPEECH_LAYOUT.FALLBACK_HEIGHT }).fits;
    } catch (error) {
      if (!this.greetCheckWarned) console.warn('[Mission] A greeting check failed; no greeting, and the mission carries on.', error);
      this.greetCheckWarned = true; // said once, not every frame
      return false;
    }
  }

  /* ---------------------------------------------------------------- update */

  update(time, delta) {
    const p = this.player;
    const dt = Math.min(delta, 100);

    // Only the mission that is busy with the player gets frame updates. When none is, the
    // waiting (unlocked) missions are checked in order, and the first one to open its offer
    // ends the check, so two offers can never open together.
    const engaged = this.engagedUnit();
    if (engaged) {
      engaged.flow.update(dt, p.x, p.y);
    } else {
      for (const unit of this.offerableUnits()) {
        if (this.replayIds.has(unit.def.id)) continue; // a replay is chosen with the prompt, never opened by itself
        unit.flow.update(dt, p.x, p.y);
        if (unit.flow.state !== STATES.AVAILABLE) break;
      }
    }
    this.updateReplayPrompt();
    this.updateSpeech(dt);
    this.updateGreeting();

    if (this.package.visible) {
      this.package
        .setPosition(p.x, p.y - 72 + Math.sin(time / 220) * 2)
        .setDepth(p.depth + 1);
    }

    this.updateArrow();
    if (!this.handlePreRender) this.positionSpeech(); // no camera event to do it
  }

  // Where the arrow should point: at the mission in progress; otherwise at the shop of the
  // new job (a newly unlocked mission that has never been delivered). Nothing else: a shop that
  // can only be REPLAYED never gets an arrow, so once there is no new or active job the arrow is
  // gone. (Nor while an offer card or the "done" banner is showing.)
  currentTarget() {
    const active = this.activeUnit();
    if (active) {
      const { targets } = active.view;
      return active.flow.state === STATES.PICKUP
        ? { ...targets.pickup, kind: 'pickup' }
        : { ...targets.deliver, kind: 'deliver' };
    }
    if (this.engagedUnit()) return null;
    const next = this.offerableUnits().find((unit) => unit.def.id === this.newJobId);
    return next ? { ...next.view.targets.offer, kind: 'offer' } : null;
  }

  // When the objective is off-screen, show an arrow at the screen edge pointing toward it.
  updateArrow() {
    const target = this.currentTarget();
    if (!target) {
      this.ui.hideArrow();
      return;
    }

    const cam = this.scene.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const sx = (target.x - cam.worldView.x) * cam.zoom;
    const sy = (target.y - cam.worldView.y) * cam.zoom;

    // keep the arrow clear of the HUD at the top and the joystick at the bottom
    const m = { l: 36, r: 36, t: ARROW_MARGIN_TOP, b: 170 };
    m.t = this.arrowTopMargin(m, w, h);
    const onScreen = sx > m.l && sx < w - m.r && sy > m.t && sy < h - m.b;
    if (onScreen) {
      this.ui.hideArrow();
      return;
    }

    const cx = w / 2;
    const cy = h / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const scaleX = (dx > 0 ? w - m.r - cx : cx - m.l) / Math.max(Math.abs(dx), 1e-6);
    const scaleY = (dy > 0 ? h - m.b - cy : cy - m.t) / Math.max(Math.abs(dy), 1e-6);
    const k = Math.min(scaleX, scaleY);
    this.ui.showArrow(cx + dx * k, cy + dy * k, Math.atan2(dy, dx), target.kind);
  }

  // The arrow's top margin: 120 px (the HUD bar and the objective line), as always, except while a HUD
  // message is showing. The new-job notice takes the objective line's place and ends below that margin,
  // and the arrow reaches about 19 px past its centre, so the margin moves down to clear the message:
  // its bottom edge + a gap + the arrow's reach. It never moves so far that fewer than
  // ARROW_MIN_WINDOW px are left above the bottom margin (a short screen keeps the old margin), and a
  // failure to measure leaves the margin as it was. Direction and target are not affected.
  arrowTopMargin(m, viewWidth, viewHeight) {
    if (typeof this.ui.hudMessageBottom !== 'function') return m.t;
    try {
      const messageBottom = this.ui.hudMessageBottom(viewWidth, viewHeight);
      if (!(messageBottom > 0)) return m.t;
      const wanted = messageBottom + ARROW_MESSAGE_GAP + ARROW_REACH;
      return Math.max(m.t, Math.min(wanted, viewHeight - m.b - ARROW_MIN_WINDOW));
    } catch (error) {
      if (!this.arrowMarginWarned) console.warn('[Mission] The arrow could not be kept clear of the HUD message.', error);
      this.arrowMarginWarned = true; // said once, not every frame
      return m.t;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Detach every mission from the save, which keeps the last progress for later saves.
    this.units.forEach((unit) => {
      if (!unit.bound) return;
      try {
        getSaveManager()?.unbindMission(unit.def.id);
      } catch (error) {
        console.warn(`[Mission] "${unit.def.id}" could not be disconnected from the save system.`, error);
      }
      unit.bound = false;
    });
    this.promptUnit = null;
    this.speech = null;
    this.pendingNewJob = null;
    this.guardSpeech(() => this.unhookCamera());
    this.player.inputLocked = false;
    this.ui.destroy();
    this.package.destroy();
  }
}
