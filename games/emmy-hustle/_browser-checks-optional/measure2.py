import json, sys
from playwright.sync_api import sync_playwright
from measure import VIEWPORTS

JS = r"""
async ({side, insets, text}) => {
  const { ui, joystick } = window.h;
  document.getElementById('inset-override').textContent = insets
    ? `:root{--safe-top:${insets.top}px;--safe-right:${insets.right}px;--safe-bottom:${insets.bottom}px;--safe-left:${insets.left}px}` : '';
  joystick.setSide(side); joystick.setVisible(true);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const W = innerWidth, H = innerHeight, I = insets || {top:0,right:0,bottom:0,left:0};
  const R = (el) => { const r = el.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; };
  const ov = (a,b) => Math.min(a.r,b.r) > Math.max(a.l,b.l)+0.01 && Math.min(a.b,b.b) > Math.max(a.t,b.t)+0.01;
  const hud = ['.hud-title','.hud-money','.settings-btn','.mission-objective'].map(s => R(document.querySelector(s)));
  const zone = R(document.querySelector('.joystick-zone'));
  const joy = { cx: zone.l+zone.w/2, cy: zone.t+zone.h/2, r: zone.w/2 };
  const circleHits = (b) => { const nx=Math.max(b.l,Math.min(joy.cx,b.r)), ny=Math.max(b.t,Math.min(joy.cy,b.b)); return Math.hypot(nx-joy.cx, ny-joy.cy) < joy.r - 0.01; };
  const zoom = Math.min(Math.max(Math.min(W,H)/460,0.8),1.4);
  const emmy = { x: W/2, feet: H/2 + 28*zoom };
  const oldGate = (x,a) => x>=12 && x<=W-12 && a>=120 && a<=H-12;
  const out = { W, H, side, zoom:+zoom.toFixed(2), samples:0, oldAccepted:0, newAccepted:0, regress:0, gained:0,
    gatedJoy:0, gatedHud:0, gatedOut:0, gatedCust:0, gatedTail:0, ungatedJoy:0, ungatedOut:0, ungatedNoWayOut:0, above:0, below:0, shifted:0, ex:{} };
  for (let dy=-190; dy<=190; dy+=5) for (let dx=-190; dx<=190; dx+=5) {
    if (Math.hypot(dx,dy) > 190) continue;
    const x = emmy.x + dx*zoom, feetY = emmy.feet + dy*zoom, anchorY = feetY - 100*zoom;
    const spot = { x, anchorY, feetY, viewWidth: W, viewHeight: H };
    out.samples++;
    const o = oldGate(x, anchorY), n = ui.canPlaceSpeech(text, spot);
    if (o) out.oldAccepted++; if (n) out.newAccepted++;
    if (o && !n) { out.regress++; (out.ex.regress ??= []).length < 3 && out.ex.regress.push({dx,dy}); }
    if (!o && n) out.gained++;
    ui.showSpeech(text); ui.speechPlaced = '';
    ui.placeSpeech(spot);
    const b = R(ui.speech);
    const inside = b.l >= I.left+12-0.5 && b.r <= W-I.right-12+0.5 && b.t >= 0 && b.b <= H-I.bottom-12+0.5;
    const hitsJoy = circleHits(b);
    if (n) {
      if (ui.speech.dataset.flip === 'below') out.below++; else out.above++;
      if (hitsJoy) { out.gatedJoy++; (out.ex.joy ??= []).length < 3 && out.ex.joy.push({dx,dy}); }
      if (hud.some(h => ov(b,h))) { out.gatedHud++; (out.ex.hud ??= []).length < 3 && out.ex.hud.push({dx,dy,top:+b.t.toFixed(1)}); }
      if (!inside) { out.gatedOut++; (out.ex.out ??= []).length < 3 && out.ex.out.push({dx,dy}); }
      const cust = { l:x-20*zoom, r:x+20*zoom, t:feetY-64*zoom, b:feetY };
      if (ov(b, cust)) { out.gatedCust++; (out.ex.cust ??= []).length < 3 && out.ex.cust.push({dx,dy}); }
      // tail still lands on the customer: its screen x within 1px of the customer x (or the corner-inset clamp)
      const tailScreen = b.l + parseFloat(ui.speechTail.style.left);
      if (Math.abs(tailScreen - x) > 16) out.gatedTail++;
      if (Math.abs(b.l - Math.min(Math.max(x - b.w/2, I.left+12), W-I.right-12-b.w)) > 0.6) out.shifted++;
    } else {
      // replies are not gated: they must still stay on screen and, if at all possible, off the joystick
      if (!inside) out.ungatedOut++;
      if (hitsJoy) out.ungatedJoy++;
    }
    ui.hideSpeech();
  }
  return out;
}
"""

CASES = [(None, "no insets"), ({"top":0,"right":47,"bottom":21,"left":47}, "notch insets L47 R47 B21")]
def main():
    text = "You crossed all of Orisun Close for me. Thank you!"
    rows = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, w, h in VIEWPORTS:
            if not ("land" in name or "boundary" in name): continue
            if "not short" in name: continue
            for insets, ilabel in CASES:
                for side in ("right", "left"):
                    ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=True)
                    pg = ctx.new_page(); pg.goto("http://localhost:8765/harness.html"); pg.wait_for_function("window.ready===true")
                    r = pg.evaluate(JS, {"side": side, "insets": insets, "text": text}); r["name"] = name; r["ins"] = ilabel
                    rows.append(r); ctx.close()
        b.close()
    print(f"{'viewport':26} {'insets':8} side  old  new  regr gain | above below shifted | gated: joy hud out cust tail | ungated: out joy")
    bad = 0
    for r in rows:
        flag = any(r[k] for k in ('regress','gatedJoy','gatedHud','gatedOut','gatedCust','gatedTail','ungatedOut'))
        bad += flag
        print(f"{r['name']:26} {'notch' if 'notch' in r['ins'] else 'none':8} {r['side']:5} {r['oldAccepted']:4} {r['newAccepted']:4} {r['regress']:4} {r['gained']:4} | {r['above']:5} {r['below']:5} {r['shifted']:7} | {r['gatedJoy']:9} {r['gatedHud']:3} {r['gatedOut']:3} {r['gatedCust']:4} {r['gatedTail']:4} | {r['ungatedOut']:8} {r['ungatedJoy']:3} {'  <-- CHECK' if flag else ''} {json.dumps(r['ex']) if flag else ''}")
    print("rows with any hard failure:", bad, "of", len(rows))
    json.dump(rows, open('/home/claude/bc/after2.json','w'), indent=1)
main()
