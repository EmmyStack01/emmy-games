import settings from '../state/Settings.js';

// A small gear button (top bar) that opens a panel for control settings.
// It only talks to the Settings module; it knows nothing about the joystick.

const GEAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="3.4" stroke-dasharray="3.3 3.3"/>' +
  '<circle cx="12" cy="12" r="7" fill="currentColor"/>' +
  '<circle class="gear-hole" cx="12" cy="12" r="2.8"/>' +
  '</svg>';

const JOYSTICK_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

export default class SettingsPanel {
  /**
   * @param {object} options
   * @param {HTMLElement} options.buttonHost  where the gear button is mounted
   * @param {HTMLElement} options.panelHost   where the panel is mounted
   */
  constructor({ buttonHost, panelHost } = {}) {
    this.buttonHost = buttonHost;
    this.panelHost = panelHost;
    this.isOpen = false;
    this.enabled = false;
    this.segments = new Map();

    if (!buttonHost || !panelHost) {
      console.warn('SettingsPanel: mount elements not found, settings UI disabled.');
      return;
    }

    this.build();
    this.bind();
    this.render();
    this.enabled = true;
  }

  /* -------------------------------------------------------------- setup */

  build() {
    // Gear button
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'settings-btn';
    this.button.setAttribute('aria-label', 'Open settings');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-controls', 'settings-panel');
    this.button.innerHTML = GEAR_SVG;

    // Panel
    this.panel = document.createElement('section');
    this.panel.id = 'settings-panel';
    this.panel.className = 'settings-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Settings');

    const header = document.createElement('div');
    header.className = 'settings-header';

    const title = document.createElement('h2');
    title.className = 'settings-title';
    title.textContent = 'Settings';

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'settings-close';
    this.closeButton.setAttribute('aria-label', 'Close settings');
    this.closeButton.textContent = '\u2715';

    header.append(title, this.closeButton);

    const label = document.createElement('p');
    label.className = 'settings-label';
    label.id = 'setting-joystick-label';
    label.textContent = 'Joystick Position';

    const group = document.createElement('div');
    group.className = 'segmented';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', 'setting-joystick-label');

    JOYSTICK_OPTIONS.forEach(({ value, label: text }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'segment';
      btn.dataset.side = value;

      const icon = document.createElement('span');
      icon.className = 'segment-icon';
      icon.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'segment-label';
      name.textContent = text;

      btn.append(icon, name);
      group.appendChild(btn);
      this.segments.set(value, btn);
    });

    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = 'Moves the on-screen joystick. Saved on this device.';

    this.panel.append(header, label, group, hint);

    this.buttonHost.appendChild(this.button);
    this.panelHost.appendChild(this.panel);
  }

  bind() {
    this.onToggle = () => (this.isOpen ? this.close() : this.open());
    this.onClose = () => this.close(true);

    this.onSegment = (e) => {
      const btn = e.target.closest('.segment');
      if (btn && this.panel.contains(btn)) settings.setJoystickSide(btn.dataset.side);
    };

    // Tapping anywhere outside the panel / gear closes it.
    this.onOutside = (e) => {
      if (!this.isOpen) return;
      if (this.panel.contains(e.target) || this.button.contains(e.target)) return;
      this.close();
    };

    this.onKey = (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close(true);
    };

    this.onSettingChanged = () => this.render();

    this.button.addEventListener('click', this.onToggle);
    this.closeButton.addEventListener('click', this.onClose);
    this.panel.addEventListener('click', this.onSegment);
    document.addEventListener('pointerdown', this.onOutside, true);
    window.addEventListener('keydown', this.onKey);
    settings.on('joystick-side-changed', this.onSettingChanged);
  }

  /* --------------------------------------------------------------- state */

  render() {
    const current = settings.joystickSide;
    this.segments.forEach((btn, value) => {
      btn.setAttribute('aria-pressed', String(value === current));
    });
  }

  open() {
    this.isOpen = true;
    this.panel.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.button.setAttribute('aria-label', 'Close settings');
  }

  close(returnFocus = false) {
    this.isOpen = false;
    this.panel.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', 'Open settings');
    if (returnFocus) this.button.focus();
  }

  /* ------------------------------------------------------------- cleanup */

  destroy() {
    if (!this.enabled) return;
    this.button.removeEventListener('click', this.onToggle);
    this.closeButton.removeEventListener('click', this.onClose);
    this.panel.removeEventListener('click', this.onSegment);
    document.removeEventListener('pointerdown', this.onOutside, true);
    window.removeEventListener('keydown', this.onKey);
    settings.off('joystick-side-changed', this.onSettingChanged);
    this.button.remove();
    this.panel.remove();
    this.enabled = false;
  }
}