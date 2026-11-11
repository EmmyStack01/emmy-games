// Fixed-position virtual joystick built with plain DOM + Pointer Events (no
// dependencies). It knows nothing about Phaser or the player: it only reports
// a vector via onChange(x, y), each axis -1..1, length <= 1.
//
//   x: -1 = left,  +1 = right
//   y: -1 = up,    +1 = down   (matches screen / game coordinates)
//
// The joystick can sit in the bottom-left or bottom-right corner (see setSide).

export default class VirtualJoystick {
  /**
   * @param {object}   options
   * @param {HTMLElement} [options.parent]   element to mount into
   * @param {(x:number, y:number) => void} options.onChange
   * @param {'left'|'right'} [options.side='right']  which bottom corner
   * @param {number}   [options.deadZone=0.12]  0..1 fraction of travel ignored
   * @param {boolean}  [options.autoShow=true]  show on touch devices only
   */
  constructor({ parent, onChange, side = 'right', deadZone = 0.12, autoShow = true } = {}) {
    this.parent = parent || document.body;
    this.onChange = typeof onChange === 'function' ? onChange : () => {};
    this.deadZone = deadZone;
    this.side = side === 'left' ? 'left' : 'right';

    this.pointerId = null;
    this.center = { x: 0, y: 0 };
    this.travel = 1;
    this.value = { x: 0, y: 0 };
    this.revealOnTouch = null;

    this.build();
    this.bind();

    if (autoShow) this.applyAutoVisibility();
  }

  get isActive() {
    return this.pointerId !== null;
  }

  /* ------------------------------------------------------------- setup */

  build() {
    // The shared host starts with the `hidden` attribute in index.html.
    this.parent.hidden = false;

    this.zone = document.createElement('div');
    this.zone.className = 'joystick-zone';
    this.zone.dataset.side = this.side;
    this.zone.setAttribute('role', 'group');
    this.zone.setAttribute('aria-label', 'Movement joystick (touch)');

    this.base = document.createElement('div');
    this.base.className = 'joystick-base';

    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';

    this.base.appendChild(this.knob);
    this.zone.appendChild(this.base);
    this.parent.appendChild(this.zone);
  }

  bind() {
    this.onDown = (e) => {
      if (this.pointerId !== null) return; // already tracking one finger
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();

      this.pointerId = e.pointerId;
      try {
        this.zone.setPointerCapture(e.pointerId);
      } catch (_) {
        /* capture can fail on some browsers; window-level fallback not needed */
      }
      this.measure();
      this.zone.classList.add('is-active');
      this.update(e);
    };

    this.onMove = (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this.update(e);
    };

    this.onUp = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.release();
    };

    this.onResize = () => {
      if (this.isActive) this.measure();
    };

    this.onBlur = () => this.release();
    this.onVisibility = () => {
      if (document.hidden) this.release();
    };

    this.stopEvent = (e) => e.preventDefault();

    const z = this.zone;
    z.addEventListener('pointerdown', this.onDown);
    z.addEventListener('pointermove', this.onMove);
    z.addEventListener('pointerup', this.onUp);
    z.addEventListener('pointercancel', this.onUp);
    z.addEventListener('lostpointercapture', this.onUp);
    z.addEventListener('contextmenu', this.stopEvent);
    // Safari pinch-zoom gestures
    z.addEventListener('gesturestart', this.stopEvent);
    z.addEventListener('gesturechange', this.stopEvent);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  applyAutoVisibility() {
    const flag = new URLSearchParams(window.location.search).get('joystick');
    const off = flag === 'off' || flag === '0' || flag === 'false';

    if (flag !== null && !off) {
      this.setVisible(true); // ?joystick forces it on (desktop testing)
      return;
    }
    if (off) {
      this.setVisible(false);
      return;
    }

    const coarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    this.setVisible(coarse);

    if (!coarse) {
      // Touch-screen laptops etc.: reveal after the first finger touch.
      this.revealOnTouch = (e) => {
        if (e.pointerType !== 'touch') return;
        this.setVisible(true);
        window.removeEventListener('pointerdown', this.revealOnTouch);
        this.revealOnTouch = null;
      };
      window.addEventListener('pointerdown', this.revealOnTouch, { passive: true });
    }
  }

  setVisible(visible) {
    this.zone.hidden = !visible;
    if (!visible) this.release();
  }

  /**
   * Moves the joystick to the bottom-left or bottom-right corner.
   * Active input is stopped first, so Emmy never keeps walking on stale input
   * and the next touch re-measures the joystick at its new position.
   */
  setSide(side) {
    if (side !== 'left' && side !== 'right') return;
    if (side === this.side) return;

    this.release(); // zeroes the vector and releases pointer capture safely
    this.side = side;
    this.zone.dataset.side = side;
  }

  /* ----------------------------------------------------------- tracking */

  measure() {
    const baseRect = this.base.getBoundingClientRect();
    const knobRect = this.knob.getBoundingClientRect();
    this.center.x = baseRect.left + baseRect.width / 2;
    this.center.y = baseRect.top + baseRect.height / 2;
    // The knob's edge stays inside the base ring at full tilt.
    this.travel = Math.max(1, (baseRect.width - knobRect.width) / 2);
  }

  update(e) {
    const dx = e.clientX - this.center.x;
    const dy = e.clientY - this.center.y;
    const dist = Math.hypot(dx, dy);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;

    const clamped = Math.min(dist, this.travel);
    this.setKnob(nx * clamped, ny * clamped);

    // Magnitude 0..1 with a rescaled dead zone so movement ramps in smoothly.
    const magnitude = clamped / this.travel;
    let scaled = 0;
    if (magnitude > this.deadZone) {
      scaled = (magnitude - this.deadZone) / (1 - this.deadZone);
    }
    this.emit(nx * scaled, ny * scaled);
  }

  release() {
    const id = this.pointerId;
    this.pointerId = null; // cleared first so lostpointercapture is ignored

    if (id !== null) {
      try {
        this.zone.releasePointerCapture(id);
      } catch (_) {
        /* already released */
      }
    }

    this.zone.classList.remove('is-active');
    this.setKnob(0, 0);

    // Always tell the game we stopped, even if the value was already zero.
    this.value.x = 0;
    this.value.y = 0;
    this.onChange(0, 0);
  }

  setKnob(px, py) {
    this.knob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
  }

  emit(x, y) {
    if (x === this.value.x && y === this.value.y) return;
    this.value.x = x;
    this.value.y = y;
    this.onChange(x, y);
  }

  /* ------------------------------------------------------------ cleanup */

  destroy() {
    this.release();

    const z = this.zone;
    z.removeEventListener('pointerdown', this.onDown);
    z.removeEventListener('pointermove', this.onMove);
    z.removeEventListener('pointerup', this.onUp);
    z.removeEventListener('pointercancel', this.onUp);
    z.removeEventListener('lostpointercapture', this.onUp);
    z.removeEventListener('contextmenu', this.stopEvent);
    z.removeEventListener('gesturestart', this.stopEvent);
    z.removeEventListener('gesturechange', this.stopEvent);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.revealOnTouch) {
      window.removeEventListener('pointerdown', this.revealOnTouch);
    }

    z.remove();
  }
}