import json
from playwright.sync_api import sync_playwright
from measure import VIEWPORTS
JS = r"""
async ({side, insets, text}) => {
  const { ui, joystick } = window.h;
  const { placeSpeechBubble } = await import('/src/ui/speechPlacement.js');
  document.getElementById('inset-override').textContent = insets
    ? `:root{--safe-top:${insets.top}px;--safe-right:${insets.right}px;--safe-bottom:${insets.bottom}px;--safe-left:${insets.left}px}` : '';
  joystick.setSide(side); joystick.setVisible(true);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const W = innerWidth, H = innerHeight, I = insets || {top:0,right:0,bottom:0,left:0};
  const zoom = Math.min(Math.max(Math.min(W,H)/460,0.8),1.4);
  const emmy = { x: W/2, feet: H/2 + 28*zoom };
  const oldGate = (x,a) => x>=12 && x<=W-12 && a>=120 && a<=H-12;
  ui.showSpeech(text); const size = {width: ui.speech.offsetWidth, height: ui.speech.offsetHeight}; ui.hideSpeech();
  const c = { regress:0, byJoystick:0, byNotchX:0, byVertical:0, levelNorth:{old:0,new:0,total:0}, levelNorthNoJoyBlock:{new:0,total:0} };
  for (let dy=-190; dy<=190; dy+=5) for (let dx=-190; dx<=190; dx+=5) {
    if (Math.hypot(dx,dy) > 190) continue;
    const x = emmy.x + dx*zoom, feetY = emmy.feet + dy*zoom, anchorY = feetY - 100*zoom;
    const spot = { x, anchorY, feetY, viewWidth: W, viewHeight: H };
    const o = oldGate(x, anchorY), n = ui.canPlaceSpeech(text, spot);
    const noJoy = placeSpeechBubble({ ...spot, ...size, insets: I, joystick: null }).fits;
    if (o && !n) {
      c.regress++;
      if (noJoy) c.byJoystick++;
      else if (x < I.left + 12 || x > W - I.right - 12) c.byNotchX++;
      else c.byVertical++;
    }
    // "level with or slightly north of Emmy": customer feet from 60 world px north to level; anywhere sideways in the radius
    if (dy >= -60 && dy <= 0) { c.levelNorth.total++; if (o) c.levelNorth.old++; if (n) c.levelNorth.new++; if (noJoy) c.levelNorthNoJoyBlock.new++; }
  }
  return c;
}
"""
rows=[]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name,w,h in VIEWPORTS:
        if "land" not in name and "short" not in name: continue
        if "not short" in name or "tablet" in name or "desktop" in name: continue
        for insets in (None, {"top":0,"right":47,"bottom":21,"left":47}):
            ctx=b.new_context(viewport={"width":w,"height":h},has_touch=True); pg=ctx.new_page()
            pg.goto("http://localhost:8765/harness.html"); pg.wait_for_function("window.ready===true")
            r=pg.evaluate(JS,{"side":"right","insets":insets,"text":"You crossed all of Orisun Close for me. Thank you!"}); r["name"]=name; r["ins"]="notch" if insets else "none"; rows.append(r); ctx.close()
    b.close()
print(f"{'viewport':26} insets | regressions: total  joystick-blocked  notch-x  too-little-room | level/north customers: old-gate new-gate (of)  [new, ignoring joystick]")
for r in rows:
    ln=r['levelNorth']
    print(f"{r['name']:26} {r['ins']:6} | {r['regress']:20} {r['byJoystick']:15} {r['byNotchX']:8} {r['byVertical']:14} | {ln['old']:12} {ln['new']:8} ({ln['total']})   [{r['levelNorthNoJoyBlock']['new']}]")
