/* Emmy Games: mobile menu */
(function () {
  var drawer = document.getElementById("drawer"), overlay = document.getElementById("overlay"),
      openBtn = document.getElementById("openMenu"), closeBtn = document.getElementById("closeMenu");
  if (!drawer || !openBtn) return;
  function setDrawer(open) {
    drawer.classList.toggle("open", open); overlay.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open)); openBtn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("no-scroll", open);
    if (open) closeBtn.focus(); else openBtn.focus({ preventScroll: true });
  }
  openBtn.addEventListener("click", function () { setDrawer(true); });
  closeBtn.addEventListener("click", function () { setDrawer(false); });
  overlay.addEventListener("click", function () { setDrawer(false); });
  drawer.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setDrawer(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer.classList.contains("open")) setDrawer(false); });
  window.matchMedia("(min-width:900px)").addEventListener("change", function (m) { if (m.matches && drawer.classList.contains("open")) setDrawer(false); });
})();
