/* Nest header kit: behaviour. No dependencies. */
(function () {
  var d = document, r = d.documentElement;
  function $(id) { return d.getElementById(id); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var hdr = $("siteHeader"), ann = $("announce"), acct = $("acct"), acctBtn = $("acctBtn"),
      menu = $("acctMenu"), drawer = $("drawer"), burger = $("burger"), closeBtn = $("drawerClose");

  /* announcement bar: dismiss and remember */
  if (ann) {
    if (get("nest_announce") === "1") ann.hidden = true;
    $("announceX").addEventListener("click", function () { ann.hidden = true; put("nest_announce", "1"); });
  }

  /* shrink on scroll */
  function onScroll() { hdr.classList.toggle("scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* account dropdown */
  function setMenu(open) { menu.hidden = !open; acctBtn.setAttribute("aria-expanded", String(open)); }
  acctBtn.addEventListener("click", function (e) { e.stopPropagation(); setMenu(menu.hidden); });
  d.addEventListener("click", function (e) { if (!menu.hidden && !acct.contains(e.target)) setMenu(false); });

  /* mobile drawer with focus trap */
  var lastFocus = null;
  function focusables() {
    return Array.prototype.slice.call(drawer.querySelectorAll("a[href],button:not([disabled])"))
      .filter(function (n) { return n.offsetParent !== null; });
  }
  function setDrawer(open) {
    drawer.hidden = !open;
    burger.setAttribute("aria-expanded", String(open));
    d.body.classList.toggle("nav-lock", open);
    if (open) { lastFocus = d.activeElement; closeBtn.focus(); }
    else if (lastFocus) { lastFocus.focus(); }
  }
  burger.addEventListener("click", function () { setDrawer(true); });
  closeBtn.addEventListener("click", function () { setDrawer(false); });
  drawer.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-close") || (e.target.closest && e.target.closest(".drawer-nav a"))) setDrawer(false);
  });
  d.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!menu.hidden) { setMenu(false); acctBtn.focus(); }
      if (!drawer.hidden) setDrawer(false);
    }
    if (e.key === "Tab" && !drawer.hidden) {
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener("resize", function () { if (window.innerWidth > 1080 && !drawer.hidden) setDrawer(false); });

  /* theme toggle (follows the device until the visitor chooses) */
  function current() {
    return r.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function labels() {
    var t = current() === "dark" ? "Dark" : "Light";
    Array.prototype.forEach.call(d.querySelectorAll("[data-theme-label]"), function (n) { n.textContent = t; });
  }
  var saved = get("nest_theme"); if (saved === "dark" || saved === "light") r.setAttribute("data-theme", saved);
  Array.prototype.forEach.call(d.querySelectorAll("[data-theme-toggle]"), function (b) {
    b.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      r.setAttribute("data-theme", next); put("nest_theme", next); labels();
    });
  });
  labels();

  /* badges: call these from your cart and wishlist code */
  function badge(id, n) {
    var el = $(id); if (!el) return;
    n = Math.max(0, parseInt(n, 10) || 0);
    el.textContent = n > 99 ? "99+" : String(n);
    el.setAttribute("data-zero", n === 0 ? "true" : "false");
  }
  window.NestHeader = {
    setCart: function (n) { badge("cartBadge", n); },
    setWishlist: function (n) { badge("wishBadge", n); }
  };
})();
