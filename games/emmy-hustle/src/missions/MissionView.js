import { STATES } from './MissionFlow.js';
import { CUSTOMER_LOOK } from './missionData.js';
import { customerTextureKey, QUEST_MARKER_KEY } from './missionTextures.js';

const UI_DEPTH = 6000; // floating markers sit above everything in the world

// How the job marker above a shop looks. "new" is the bright, bobbing gold marker of a job
// that has never been delivered. "repeatable" is the quiet version for a job that can be
// replayed: dimmer, a little smaller, grey-blue, and still. The marker stays VISIBLE either
// way; only a locked job, or a job in progress, hides it.
export const MARKER_STYLE = Object.freeze({ NEW: 'new', REPEATABLE: 'repeatable' });

export const MARKER_LOOK = Object.freeze({
  [MARKER_STYLE.NEW]: Object.freeze({ texture: QUEST_MARKER_KEY.new, alpha: 1, scale: 1, bobbing: true }),
  [MARKER_STYLE.REPEATABLE]: Object.freeze({ texture: QUEST_MARKER_KEY.repeatable, alpha: 0.5, scale: 0.8, bobbing: false }),
});

// The pictures in the world that belong to ONE mission: the "job available" bubble above its
// shop, the collection ring and arrow, the customer (with a shadow) and the customer's ring
// and arrow. The customer has a look of their own (CUSTOMER_LOOK). It only draws; it knows
// nothing about rules, money or saving. MissionSystem
// creates one for every mission that can be played, and tells it what to show.
// The customer waits through PICKUP and DELIVER and stays through DONE, so their reply can be
// seen; the customer's ring and arrow (the delivery guidance) show only in DELIVER.
export default class MissionView {
  constructor(scene, def) {
    this.def = def;
    const bob = (target, distance, duration) =>
      scene.tweens.add({ targets: target, y: target.y - distance, duration, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const pulse = (target) =>
      scene.tweens.add({ targets: target, scaleX: 1.12, scaleY: 1.12, alpha: 0.55, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // where the markers point (not bobbing), used by the off-screen arrow
    this.targets = {
      offer: { x: def.shop.marker.x, y: def.shop.marker.y },
      pickup: { x: def.pickup.x, y: def.pickup.y - 30 },
      deliver: { x: def.customer.x, y: def.customer.y - 40 },
    };

    // "Job available" bubble above the shop
    this.questMarker = scene.add
      .image(def.shop.marker.x, def.shop.marker.y, 'mk_quest')
      .setOrigin(0.5, 1)
      .setDepth(UI_DEPTH);
    this.questBob = bob(this.questMarker, 8, 650); // kept, so a repeatable marker can stand still
    this.markerStyle = MARKER_STYLE.NEW;

    // Collection point: ring on the pavement + arrow above it
    this.pickupRing = scene.add.image(def.pickup.x, def.pickup.y, 'mk_ring_blue').setDepth(def.pickup.y - 3);
    pulse(this.pickupRing);
    this.pickupArrow = scene.add
      .image(def.pickup.x, def.pickup.y - 56, 'mk_arrow_blue')
      .setOrigin(0.5, 1)
      .setDepth(UI_DEPTH);
    bob(this.pickupArrow, 7, 520);

    // The customer, waving, with her own shadow
    const c = def.customer;
    this.customerShadow = scene.add.image(c.x, c.y - 1.5, 'shadow').setDepth(c.y - 1);
    this.customer = scene.add.image(c.x, c.y, customerTextureKey(CUSTOMER_LOOK[def.id] ?? 'folake')).setOrigin(0.5, 1).setDepth(c.y);
    scene.tweens.add({ targets: this.customer, y: c.y - 1.5, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.customerRing = scene.add.image(c.x, c.y, 'mk_ring_gold').setDepth(c.y - 3);
    pulse(this.customerRing);
    this.customerArrow = scene.add.image(c.x, c.y - 74, 'mk_arrow_gold').setOrigin(0.5, 1).setDepth(UI_DEPTH);
    bob(this.customerArrow, 7, 520);
  }

  // Dresses the job marker as a new job or a replayable one. Changing it again to the same
  // style does nothing.
  setMarkerStyle(style) {
    const look = MARKER_LOOK[style];
    if (!look) throw new Error(`MissionView: unknown marker style "${style}"`);
    if (style === this.markerStyle) return;
    this.markerStyle = style;
    this.questMarker.setTexture(look.texture).setAlpha(look.alpha).setScale(look.scale);
    if (look.bobbing) {
      this.questBob.resume();
    } else {
      this.questBob.pause();
      this.questMarker.setPosition(this.def.shop.marker.x, this.def.shop.marker.y); // rest at its spot
    }
  }

  // Shows what belongs to this mission's state. markerOpen is false when the job marker must
  // stay hidden even though the mission is available (the mission is still locked, or another
  // job is in progress). markerStyle says how the marker looks when it is shown.
  apply(state, { markerOpen = true, markerStyle = MARKER_STYLE.NEW } = {}) {
    const show = (objects, visible) => objects.forEach((o) => o.setVisible(visible));
    this.setMarkerStyle(markerStyle);
    show([this.questMarker], markerOpen && (state === STATES.AVAILABLE || state === STATES.OFFER));
    show([this.pickupRing, this.pickupArrow], state === STATES.PICKUP);
    show([this.customer, this.customerShadow], state === STATES.PICKUP || state === STATES.DELIVER || state === STATES.DONE);
    show([this.customerRing, this.customerArrow], state === STATES.DELIVER);
  }
}
