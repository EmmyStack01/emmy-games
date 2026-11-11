import { BUILDINGS } from '../data/neighbourhood.js';

// Mission definitions. Positions are world pixels (the same coordinates as the map).
// Lagoon Mart is looked up by id, so if the shop moves in neighbourhood.js the mission follows it.

const lagoon = BUILDINGS.find((b) => b.id === 'lagoon');
if (!lagoon) {
  throw new Error('missionData: Lagoon Mart (id "lagoon") was not found in neighbourhood.js');
}

export const naira = (n) => `\u20A6${Number(n).toLocaleString('en-NG')}`;

const REWARD = 250;

export const FIRST_DELIVERY = {
  id: 'firstDelivery',
  title: 'The First Delivery',
  reward: REWARD,

  shop: {
    // the floating "job available" marker, above the roof
    marker: { x: lagoon.x, y: lagoon.base - lagoon.h - 12 },
    // The offer card appears when Emmy walks within offerRadius of the shop door.
    door: { x: lagoon.x, y: lagoon.base + 18 },
    offerRadius: 130,
  },

  // Collection point: on the pavement right in front of the shop entrance.
  pickup: { x: lagoon.x, y: lagoon.base + 18, radius: 26 },

  // Mrs. Folake waits at Unity Square, just south of the fountain.
  customer: { name: 'Mrs. Folake', x: 1200, y: 1005, radius: 44 },

  // How long "DELIVERY COMPLETED!" is shown before the job can be taken again.
  doneDelayMs: 3200,

  text: {
    offerKicker: 'NEW JOB',
    offerTitle: 'LAGOON MART',
    offerBody: 'Got a delivery for a customer nearby!',
    offerReward: `Reward: ${naira(REWARD)}`,
    accept: 'Accept Job',
    decline: 'Not Now',
    objectivePickup: 'Pick up the package at Lagoon Mart',
    objectiveDeliver: 'Deliver the package to Mrs. Folake',
    collectedTitle: 'PACKAGE COLLECTED!',
    collectedBody: 'Now take it to the customer.',
    doneTitle: 'DELIVERY COMPLETED!',
    doneBody: `+${naira(REWARD)}`,
  },
};

/* ---------------------------------------------------------------------------
   The ordered list of missions.

   The ORDER is the unlock order: a mission opens once the one before it has been
   delivered at least once. Nothing about unlocking is stored in the save; it is worked
   out from the saved `completed` counts (see missionSequence.js).

   The ids are permanent, because the save file is keyed by them. Never rename or reuse one.
   To add a mission, add it to the END of the list with a new id.

   All definitions have the shape of FIRST_DELIVERY above, so MissionFlow can run any of
   them. Only FIRST_DELIVERY is played so far: MissionSystem still uses just that one.
--------------------------------------------------------------------------- */

const building = (id) => {
  const found = BUILDINGS.find((b) => b.id === id);
  if (!found) throw new Error(`missionData: building "${id}" was not found in neighbourhood.js`);
  return found;
};

// The spot on the pavement in front of a shop's entrance (the same rule Lagoon Mart uses).
const doorOf = (id) => {
  const b = building(id);
  return { x: b.x, y: b.base + 18 };
};

// A delivery job: collect at a shop's door, then take it to a customer.
function deliveryJob({ id, title, reward, shopId, customer, text }) {
  const shop = building(shopId);
  const door = doorOf(shopId);
  return {
    id,
    title,
    reward,
    shop: {
      marker: { x: shop.x, y: shop.base - shop.h - 12 }, // the floating job marker, above the roof
      door,
      offerRadius: 130,
    },
    pickup: { x: door.x, y: door.y, radius: 26 },
    customer: { ...customer, radius: 44 },
    doneDelayMs: 3200,
    text: {
      offerKicker: 'NEW JOB',
      offerTitle: shop.name.toUpperCase(),
      offerReward: `Reward: ${naira(reward)}`,
      accept: 'Accept Job',
      decline: 'Not Now',
      collectedTitle: 'PACKAGE COLLECTED!',
      doneTitle: 'DELIVERY COMPLETED!',
      doneBody: `+${naira(reward)}`,
      ...text,
    },
  };
}

// 2. Bakery to the far west of the north road: the first job delivered to a shop front.
export const FRESH_FROM_THE_OVEN = deliveryJob({
  id: 'freshFromTheOven',
  title: 'Fresh From the Oven',
  reward: 300,
  shopId: 'bola',
  customer: { name: 'Mama Ngozi', ...doorOf('ngozi') },
  text: {
    offerBody: "Mama Ngozi's bread is fresh from the oven. Rush it over to her shop while it's warm!",
    objectivePickup: 'Pick up the bread at Bola Bakery',
    objectiveDeliver: 'Deliver the bread to Mama Ngozi',
    collectedBody: 'Now take it to Mama Ngozi.',
  },
});

// 3. From the waterfront boardwalk across to the Community Hall.
export const SUYA_FOR_THE_HALL = deliveryJob({
  id: 'suyaForTheHall',
  title: 'Suya for the Hall',
  reward: 550,
  shopId: 'suya',
  customer: { name: 'Mr. Okafor', ...doorOf('hall') },
  text: {
    offerBody: "The Community Hall crowd is hungry! Take this suya to Mr. Okafor while it's hot.",
    objectivePickup: 'Pick up the suya at Waterside Suya Spot',
    objectiveDeliver: 'Deliver the suya to Mr. Okafor at the Community Hall',
    collectedBody: 'Now take it to Mr. Okafor at the Hall.',
  },
});

// 4. The longest run: north-east corner to Emmy's Corner Shop in the south-west.
export const ACROSS_ORISUN_CLOSE = deliveryJob({
  id: 'acrossOrisunClose',
  title: 'Across Orisun Close',
  reward: 750,
  shopId: 'ade',
  customer: { name: 'Aunty Kemi', x: 250, y: 1176 },
  text: {
    offerBody: "Aunty Kemi at Emmy's Corner Shop has waited all week for this phone part. Long walk!",
    objectivePickup: 'Pick up the phone part at Ade Mobile Fix',
    objectiveDeliver: "Deliver the part to Aunty Kemi at Emmy's Corner Shop",
    collectedBody: "Now take it to Aunty Kemi at Emmy's shop.",
  },
});

export const MISSIONS = Object.freeze([
  FIRST_DELIVERY,
  FRESH_FROM_THE_OVEN,
  SUYA_FOR_THE_HALL,
  ACROSS_ORISUN_CLOSE,
]);

// The mission ids in unlock order. The save system and the unlock rules both use this.
export const MISSION_IDS = Object.freeze(MISSIONS.map((mission) => mission.id));

// The missions that can actually be PLAYED in the game right now. The others are in the list
// (their progress is saved and restored) but have no shop marker, no customer and no offer.
// All four missions are playable, in unlock order.
export const PLAYABLE_MISSION_IDS = Object.freeze([
  FIRST_DELIVERY.id,
  FRESH_FROM_THE_OVEN.id,
  SUYA_FOR_THE_HALL.id,
  ACROSS_ORISUN_CLOSE.id,
]);

// How each customer looks (see CUSTOMER_LOOKS in missionTextures.js). A mission that is not
// listed uses Mrs. Folake's look, which is what The First Delivery has always had.
export const CUSTOMER_LOOK = Object.freeze({
  [FIRST_DELIVERY.id]: 'folake',
  [FRESH_FROM_THE_OVEN.id]: 'ngozi',
  [SUYA_FOR_THE_HALL.id]: 'okafor',
  [ACROSS_ORISUN_CLOSE.id]: 'kemi',
});
