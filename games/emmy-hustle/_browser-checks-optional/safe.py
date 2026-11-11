from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    for inset in (0, 24, 47):
        pg = b.new_page(viewport={"width":740,"height":360}); pg.goto("http://localhost:8765/harness.html"); pg.wait_for_function("window.ready===true")
        r = pg.evaluate("""async(i)=>{ const {ui}=window.h; const MS=(await import('/src/missions/MissionSystem.js')).default;
          document.getElementById('inset-override').textContent=`:root{--safe-top:${i}px}`; ui.setObjective(null);
          const hm=document.getElementById('hud-message'); hm.style.transition='none'; hm.textContent='New job at Bola Bakery! Follow the ! to find it.'; hm.classList.add('visible');
          const top = MS.prototype.arrowTopMargin.call({ui},{t:120,b:170},innerWidth,innerHeight);
          ui.showArrow(300, top, -1.8, 'offer'); const g=ui.arrow.querySelector('.arrow-edge').getBoundingClientRect(); const n=hm.getBoundingClientRect();
          hm.classList.remove('visible'); const none = MS.prototype.arrowTopMargin.call({ui},{t:120,b:170},innerWidth,innerHeight);
          return {margin: top, glyphGap: +(g.top-n.bottom).toFixed(1), noticeBottom:+n.bottom.toFixed(1), marginWithNoMessage: none}; }""", inset)
        print("safe-top", inset, r); pg.close()
    b.close()
