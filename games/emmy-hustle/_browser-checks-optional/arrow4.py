import json, subprocess
from playwright.sync_api import sync_playwright
VPS = [(844,390),(740,360),(915,412),(667,375),(568,320),(932,430),(800,480),(1024,768),(1366,768),(390,844),(360,740),(412,915),(375,667),(320,568)]
NOTICE = {"freshFromTheOven":"New job at Bola Bakery! Follow the ! to find it.","suyaForTheHall":"New job at Waterside Suya Spot! Follow the ! to find it.","acrossOrisunClose":"New job at Ade Mobile Fix! Follow the ! to find it."}
WELCOME = "Welcome to Orisun Close, Emmy! Collect coins, or follow the ! to Lagoon Mart for your first delivery."
sc = json.loads(subprocess.check_output(["node","arrow_scenarios.mjs",json.dumps(VPS)], stderr=subprocess.DEVNULL))
JS = r"""
async ({scenarios, texts, withFix}) => {
  const { ui } = window.h;
  const MS = (await import('/src/missions/MissionSystem.js')).default;
  const R = el => { const r = el.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom}; };
  const hm = document.getElementById('hud-message');
  hm.style.transition = 'none'; hm.style.transform = 'none'; // measure the settled layout, not the 0.4 s fade-in slide
  ui.setObjective(null); // the new-job state: no objective line
  const W = innerWidth, H = innerHeight;
  const place = (x, y, a) => { ui.showArrow(x, y, a, 'offer'); const n = R(hm); return { box: R(ui.arrow), glyph: R(ui.arrow.querySelector('.arrow-edge')), n }; };
  const inter = (a, b) => Math.min(a.r,b.r) - Math.max(a.l,b.l) > 0 && Math.min(a.b,b.b) - Math.max(a.t,b.t) > 0;
  // the real margin function, on a stand-in with only the real UI
  const margin = (t, b) => withFix ? MS.prototype.arrowTopMargin.call({ ui }, { t, b }, W, H) : t;
  const worst = { real: null, sweepGlyphOverlap: 0, sweepBoxOverlap: 0, sweepMinGap: 1e9, sweeps: 0, moved: 0 };
  // (1) the real post-delivery scenarios (their own notice text)
  const realRows = [];
  for (const s of scenarios) {
    hm.textContent = texts[s.next]; hm.classList.add('visible');
    const M = { l: 36, r: 36, t: 120, b: 170 };
    const onScreenBefore = false;
    const t = margin(120, 170); M.t = t;
    const w = s.w, h = s.h, cx = w/2, cy = h/2;
    const onScreen = s.sx > M.l && s.sx < w - M.r && s.sy > M.t && s.sy < h - M.b;
    if (onScreen) { realRows.push({ ...s, arrow: null }); continue; }
    const dx = s.sx - cx, dy = s.sy - cy;
    const k = Math.min((dx > 0 ? w - M.r - cx : cx - M.l) / Math.max(Math.abs(dx), 1e-6), (dy > 0 ? h - M.b - cy : cy - M.t) / Math.max(Math.abs(dy), 1e-6));
    const x = cx + dx*k, y = cy + dy*k, a = Math.atan2(dy, dx);
    const p = place(x, y, a);
    realRows.push({ next: s.next, off: s.off, top: M.t, y: +y.toFixed(1), gapGlyph: +(p.glyph.t - p.n.b).toFixed(1), gapBox: +(p.box.t - p.n.b).toFixed(1), glyphHit: inter(p.glyph, p.n), boxHit: inter(p.box, p.n), noticeBottom: +p.n.b.toFixed(1) });
  }
  // (2) every angle and every x along the top clamp row, for each text
  for (const text of Object.values(texts).concat([texts.__welcome])) {
    hm.textContent = text; hm.classList.add('visible');
    const top = margin(120, 170);
    if (top !== 120) worst.moved++;
    for (let x = 36; x <= W - 36; x += 6) for (let d = -180; d <= 180; d += 6) {
      const p = place(x, top, d*Math.PI/180);
      worst.sweeps++;
      if (inter(p.glyph, p.n)) worst.sweepGlyphOverlap++;
      if (inter(p.box, p.n)) worst.sweepBoxOverlap++;
      const share = Math.min(p.glyph.r, p.n.r) - Math.max(p.glyph.l, p.n.l) > 0;
      if (share) worst.sweepMinGap = Math.min(worst.sweepMinGap, p.glyph.t - p.n.b);
    }
  }
  ui.hideArrow(); hm.classList.remove('visible');
  return { realRows, worst, W, H };
}
"""
def run(withFix):
    out = []
    texts = dict(NOTICE); texts["__welcome"] = WELCOME
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w,h in VPS:
            pg = b.new_page(viewport={"width":w,"height":h}); pg.goto("http://localhost:8765/harness.html"); pg.wait_for_function("window.ready===true")
            mine = [s for s in sc if s["w"]==w and s["h"]==h]
            out.append(pg.evaluate(JS, {"scenarios": mine, "texts": texts, "withFix": withFix})); pg.close()
        b.close()
    return out
before, after = run(False), run(True)
print("A) REAL post-delivery scenarios: worst glyph gap to the notice's bottom edge (px; <0 overlap) over all arrows that show")
print(f"{'viewport':10} {'before':>9} {'after':>9}   after: arrow-top-margin  notice-bottom")
for b_, a_ in zip(before, after):
    def worstgap(rows): 
        g=[r['gapGlyph'] for r in rows if 'gapGlyph' in r and r['y']<r.get('noticeBottom',0)+60]; return min(g) if g else None
    ra=[r for r in a_['realRows'] if 'gapGlyph' in r and r['gapGlyph']<60]; rb=[r for r in b_['realRows'] if 'gapGlyph' in r and r['gapGlyph']<60]
    print(f"{a_['W']}x{a_['H']:<5} {str(min(r['gapGlyph'] for r in rb) if rb else '-'):>9} {str(min(r['gapGlyph'] for r in ra) if ra else '-'):>9}   {str(sorted({r['top'] for r in ra})):>22}  {sorted({r['noticeBottom'] for r in ra})}")
print()
print("B) EXHAUSTIVE sweep of the top clamp row (every x, every angle, 3 notices + welcome): overlaps / min gap")
print(f"{'viewport':10} {'sweeps':>7} | before: glyph-overlap box-overlap | after: glyph-overlap box-overlap  min-glyph-gap  margin-moved")
for b_, a_ in zip(before, after):
    bw, aw = b_['worst'], a_['worst']
    print(f"{a_['W']}x{a_['H']:<5} {aw['sweeps']:>7} | {bw['sweepGlyphOverlap']:>20} {bw['sweepBoxOverlap']:>11} | {aw['sweepGlyphOverlap']:>19} {aw['sweepBoxOverlap']:>11} {aw['sweepMinGap']:>14.1f} {aw['moved']:>12}")
