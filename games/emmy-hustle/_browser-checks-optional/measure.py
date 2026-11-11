import json, sys
from playwright.sync_api import sync_playwright

VIEWPORTS = [
  ("844x390 iPhone-14 land", 844, 390), ("740x360 Android land", 740, 360), ("915x412 Pixel land", 915, 412),
  ("667x375 iPhone-SE land", 667, 375), ("568x320 small land", 568, 320), ("932x430 large land", 932, 430),
  ("800x480 boundary (short)", 800, 480), ("800x481 boundary (not short)", 800, 481),
  ("1024x768 tablet land", 1024, 768), ("1366x768 desktop", 1366, 768),
  ("390x844 portrait", 390, 844), ("360x740 portrait", 360, 740),
]

MEASURE_JS = r"""
async ({side, insets, joystickVisible, lineText}) => {
  const { ui, joystick } = window.h;
  document.getElementById('inset-override').textContent = insets
    ? `:root{--safe-top:${insets.top}px;--safe-right:${insets.right}px;--safe-bottom:${insets.bottom}px;--safe-left:${insets.left}px}` : '';
  joystick.setSide(side); joystick.setVisible(joystickVisible);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const W = innerWidth, H = innerHeight;
  const rect = (el) => { const r = el.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; };
  const hudParts = {
    title: rect(document.querySelector('.hud-title')),
    money: rect(document.querySelector('.hud-money')),
    gear: rect(document.querySelector('.settings-btn')),
    objective: rect(document.querySelector('.mission-objective')),
  };
  const msg = document.getElementById('hud-message');
  hudParts.message = rect(msg);
  const hudBarBottom = Math.max(hudParts.title.b, hudParts.money.b, hudParts.gear.b);
  const objectiveBottom = hudParts.objective.b;
  const overlapRect = (a, b) => Math.min(a.r,b.r) > Math.max(a.l,b.l) && Math.min(a.b,b.b) > Math.max(a.t,b.t);

  // ---- toast
  ui.showToast('DELIVERY COMPLETED!', '+\u20A6250', 'done', 60000);
  await new Promise(r => setTimeout(r, 450));
  const toast = rect(ui.toast);
  const toastHits = Object.entries(hudParts).filter(([k, p]) => k !== 'message' && overlapRect(toast, p)).map(([k]) => k);
  const toastHitMsg = overlapRect(toast, hudParts.message);
  const toastInside = toast.l >= 0 && toast.r <= W && toast.t >= 0 && toast.b <= H;
  ui.toast.classList.remove('show');

  // ---- joystick
  let joy = null;
  const zone = document.querySelector('.joystick-zone');
  if (zone && !zone.hidden) { const z = rect(zone); joy = { cx: z.l + z.w/2, cy: z.t + z.h/2, r: z.w/2 }; }
  const circleHitsRect = (c, b) => {
    const nx = Math.max(b.l, Math.min(c.cx, b.r)), ny = Math.max(b.t, Math.min(c.cy, b.b));
    return Math.hypot(nx - c.cx, ny - c.cy) < c.r;
  };

  // ---- bubble vs joystick over the greeting grid
  const zoom = Math.min(Math.max(Math.min(W, H) / 460, 0.8), 1.4);
  const emmy = { x: W/2, feet: H/2 + 28*zoom };
  ui.showSpeech(lineText);
  const size = { w: ui.speech.offsetWidth, h: ui.speech.offsetHeight };
  let samples = 0, joyHits = 0, gateRejected = 0, offscreen = 0, hudHits = 0;
  const bad = [];
  const gateOld = (x, anchorY) => x >= 12 && x <= W-12 && anchorY >= 120 && anchorY <= H-12;
  for (let dy = -190; dy <= 190; dy += 10) for (let dx = -190; dx <= 190; dx += 10) {
    if (Math.hypot(dx, dy) > 190) continue;
    const x = emmy.x + dx*zoom, feetY = emmy.feet + dy*zoom, anchorY = feetY - 100*zoom;
    samples++;
    const oldOk = gateOld(x, anchorY);
    if (!oldOk) gateRejected++;
    if (!oldOk) continue; // only bubbles that old code would actually show
    ui.speechPlaced = '';
    ui.placeSpeech({ x, anchorY, feetY, viewWidth: W, viewHeight: H });
    const b = rect(ui.speech);
    if (b.l < -0.5 || b.r > W+0.5 || b.t < -0.5 || b.b > H+0.5) offscreen++;
    if (joy && circleHitsRect(joy, b)) { joyHits++; if (bad.length < 3) bad.push({dx, dy}); }
    if (Object.entries(hudParts).some(([k,p]) => k!=='message' && overlapRect(b,p))) hudHits++;
  }
  ui.hideSpeech();
  return { W, H, zoom: +zoom.toFixed(3), side, hudBarBottom: +hudBarBottom.toFixed(1), objectiveBottom: +objectiveBottom.toFixed(1),
    toast: {t:+toast.t.toFixed(1), b:+toast.b.toFixed(1), l:+toast.l.toFixed(1), r:+toast.r.toFixed(1)}, toastHits, toastHitMsg, toastInside,
    joy, bubble: size, samples, gateRejected, shownByOldGate: samples - gateRejected, joyHits, offscreen, hudHits, sampleBad: bad };
}
"""

def run(label, only=None, sides=("right","left"), insets=None):
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, w, h in VIEWPORTS:
            if only and only not in name: continue
            for side in sides:
                ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=True, is_mobile=False)
                pg = ctx.new_page()
                pg.goto("http://localhost:8765/harness.html")
                pg.wait_for_function("window.ready === true")
                r = pg.evaluate(MEASURE_JS, {"side": side, "insets": insets, "joystickVisible": True,
                                             "lineText": "You crossed all of Orisun Close for me. Thank you!"})
                r["name"] = name
                out.append(r)
                ctx.close()
        b.close()
    return out

if __name__ == "__main__":
    label = sys.argv[1] if len(sys.argv) > 1 else "run"
    res = run(label)
    json.dump(res, open(f"/home/claude/bc/{label}.json", "w"), indent=1)
    print(f"{'viewport':30} side  hudBar objBot | toast top-bot  hits                  | bubble  oldShown joyHits offscr")
    for r in res:
        print(f"{r['name']:30} {r['side']:5} {r['hudBarBottom']:6} {r['objectiveBottom']:6} | {r['toast']['t']:6}-{r['toast']['b']:6} {','.join(r['toastHits']) or '-':22} {'MSG' if r['toastHitMsg'] else '   '} | {r['bubble']['w']}x{r['bubble']['h']}  {r['shownByOldGate']:4}/{r['samples']:<4} {r['joyHits']:5}  {r['offscreen']}")
