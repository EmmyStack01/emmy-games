// What each customer says. Text only: no Phaser, no DOM, no mission rules.
//
// Kept apart from missionData.js on purpose, so mission definitions (and the tests that pin them)
// are untouched, and so every line can be reviewed in one place. Keyed by mission ID, the same
// permanent ids used by missionData.js and the save file.
//
// Three lines per customer:
//   greeting       when Emmy walks up to the customer while carrying their delivery
//   firstDelivery  after the customer's FIRST successful delivery
//   replay         after every later successful delivery
//
// Short and friendly only: no promotions, no hints about the next job.

export const DIALOGUE_KIND = Object.freeze({
  GREETING: 'greeting',
  FIRST_DELIVERY: 'firstDelivery',
  REPLAY: 'replay',
});

const line = (greeting, firstDelivery, replay) => Object.freeze({ greeting, firstDelivery, replay });

export const CUSTOMER_DIALOGUE = Object.freeze({
  // Mrs. Folake
  firstDelivery: line(
    'Over here, Emmy! Is that my parcel?',
    'Thank you, Emmy! Right on time.',
    "Another one already? You're quick!",
  ),
  // Mama Ngozi
  freshFromTheOven: line(
    'Is that my bread? It smells wonderful!',
    'Still warm! God bless you, Emmy.',
    'Right on time again. Thank you!',
  ),
  // Mr. Okafor
  suyaForTheHall: line(
    'Ah, the suya! The hall is hungry!',
    'At last! Thank you, Emmy.',
    'Hot and spicy, just as we like it!',
  ),
  // Aunty Kemi
  acrossOrisunClose: line(
    'Is that my phone part? Finally!',
    'You crossed all of Orisun Close for me. Thank you!',
    'Another long haul, and still smiling. Thank you!',
  ),
});

const KINDS = new Set(Object.values(DIALOGUE_KIND));

// The line for a mission's customer, or null when there is none (an unknown mission id or kind).
// It never throws, so a caller in the middle of a delivery cannot be interrupted by a bad lookup.
export function getCustomerLine(missionId, kind) {
  if (typeof missionId !== 'string' || !KINDS.has(kind)) return null;
  if (!Object.hasOwn(CUSTOMER_DIALOGUE, missionId)) return null;
  return CUSTOMER_DIALOGUE[missionId][kind];
}
