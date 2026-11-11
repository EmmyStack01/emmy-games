// The rules of a delivery mission, with no graphics and no Phaser: just a small state
// machine. The scene feeds it Emmy's position every frame and it reports changes through
// hooks. Keeping it separate makes the rules easy to test and to reuse for more missions.
//
//   available -> offer -> pickup -> deliver -> done -> available (replay)
//                  |
//                  +--(Not Now)--> available
//
// Progress can be saved and restored (toSave / restore, at the bottom). Only the states
// available, pickup and deliver are ever stored: the offer card and the "done" banner are
// short-lived screens, so both are stored as "available".

export const STATES = {
  AVAILABLE: 'available', // the shop shows a job marker
  OFFER: 'offer', // Emmy is at the shop and the offer card is open
  PICKUP: 'pickup', // accepted: go to the collection point
  DELIVER: 'deliver', // package collected: go to the customer
  DONE: 'done', // delivered and paid (shown briefly, then it can be replayed)
};

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export default class MissionFlow {
  /**
   * @param {object} def   a mission definition (see missionData.js)
   * @param {object} hooks onState(state, prev), onPackage(carrying), onReward(amount, runId)
   */
  constructor(def, hooks = {}) {
    this.def = def;
    this.hooks = hooks;
    this.state = STATES.AVAILABLE;
    this.runId = 0; // counts accepted jobs
    this.completed = 0; // counts jobs delivered and paid
    this.lastPaidRunId = 0; // the newest run whose reward has been paid (0 = none yet)
    this.paid = false; // has THIS run's reward been paid?
    this.dismissed = false; // "Not Now" was pressed and Emmy hasn't left the shop area yet
    this.doneTimer = 0;
  }

  get isActive() {
    return this.state === STATES.PICKUP || this.state === STATES.DELIVER;
  }

  setState(next) {
    const prev = this.state;
    if (prev === next) return;
    this.state = next;
    if (this.hooks.onState) this.hooks.onState(next, prev);
  }

  nearShop(px, py) {
    const { door, offerRadius } = this.def.shop;
    return dist(px, py, door.x, door.y) <= offerRadius;
  }

  // Call every frame with the frame time (ms) and Emmy's position (her feet).
  update(dtMs, px, py) {
    const d = this.def;
    switch (this.state) {
      case STATES.AVAILABLE:
        if (!this.nearShop(px, py)) {
          this.dismissed = false; // she left the area: the offer may appear again next time
        } else if (!this.dismissed) {
          this.setState(STATES.OFFER);
        }
        break;

      case STATES.PICKUP:
        if (dist(px, py, d.pickup.x, d.pickup.y) <= d.pickup.radius) {
          if (this.hooks.onPackage) this.hooks.onPackage(true);
          this.setState(STATES.DELIVER);
        }
        break;

      case STATES.DELIVER:
        if (dist(px, py, d.customer.x, d.customer.y) <= d.customer.radius) this.complete();
        break;

      case STATES.DONE:
        this.doneTimer += dtMs;
        if (this.doneTimer >= d.doneDelayMs) {
          this.doneTimer = 0;
          this.dismissed = this.nearShop(px, py); // don't pop the offer up under her feet
          this.setState(STATES.AVAILABLE);
        }
        break;

      default:
        break;
    }
  }

  // Opens the offer card because the player asked for it (the "Replay mission" prompt), instead
  // of Emmy walking up to the shop. It only works from "available". It touches no reward and no
  // run counter: those change only when the offer is ACCEPTED, exactly as for any other offer.
  openOffer() {
    if (this.state !== STATES.AVAILABLE) return false;
    this.setState(STATES.OFFER);
    return true;
  }

  accept() {
    if (this.state !== STATES.OFFER) return false;
    this.runId += 1;
    this.paid = false;
    if (this.hooks.onPackage) this.hooks.onPackage(false);
    this.setState(STATES.PICKUP);
    return true;
  }

  decline() {
    if (this.state !== STATES.OFFER) return false;
    this.dismissed = true;
    this.setState(STATES.AVAILABLE);
    return true;
  }

  // Pays the reward. It only works once per accepted job. A run that is already recorded
  // as paid (lastPaidRunId) can never pay again, even if the flow were put back into
  // "deliver". The counters are updated BEFORE any hook runs, so a snapshot taken at any
  // point during delivery already says this run is paid.
  complete() {
    if (this.state !== STATES.DELIVER || this.paid || this.runId <= this.lastPaidRunId) return false;
    this.paid = true;
    this.lastPaidRunId = this.runId;
    this.completed += 1;
    this.doneTimer = 0;
    this.setState(STATES.DONE);
    if (this.hooks.onPackage) this.hooks.onPackage(false);
    if (this.hooks.onReward) this.hooks.onReward(this.def.reward, this.runId);
    return true;
  }

  /* ------------------------------------------------------------ saving */

  // The progress worth keeping, as plain data (the shape saveSchema.js expects).
  toSave() {
    const state = this.state === STATES.PICKUP || this.state === STATES.DELIVER ? this.state : STATES.AVAILABLE;
    return { state, runId: this.runId, completed: this.completed, lastPaidRunId: this.lastPaidRunId };
  }

  // Puts the flow back to saved progress. It only sets values and calls NO hooks, so it can
  // never pay a reward, show a notice or play a sound; the caller shows the matching visuals
  // afterwards. Meant to be called once, right after the flow is created. Anything that is
  // not usable is ignored or made safe: a run that is already paid is never resumed, and
  // "offer" or "done" become "available". Returns false if there was nothing to restore.
  restore(saved) {
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return false;

    const whole = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
    const lastPaidRunId = whole(saved.lastPaidRunId);
    const runId = Math.max(whole(saved.runId), lastPaidRunId);
    const inProgress = (saved.state === STATES.PICKUP || saved.state === STATES.DELIVER) && runId > lastPaidRunId;

    this.runId = runId;
    this.completed = whole(saved.completed);
    this.lastPaidRunId = lastPaidRunId;
    this.state = inProgress ? saved.state : STATES.AVAILABLE;
    this.paid = runId > 0 && runId <= lastPaidRunId;
    this.dismissed = false;
    this.doneTimer = 0;
    return true;
  }
}

