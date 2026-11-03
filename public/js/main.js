(function () {
  'use strict';

  var d = document;
  var r = d.documentElement;
  var rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;

  // 1. Interactive Ambient Pointer Glow & Mesh Parallax
  if (fine && !rm) {
    window.addEventListener('pointermove', function (e) {
      var x = e.clientX / window.innerWidth;
      var y = e.clientY / window.innerHeight;
      r.style.setProperty('--mx', (x * 100) + '%');
      r.style.setProperty('--my', (y * 100) + '%');
      r.style.setProperty('--px', x - 0.5);
      r.style.setProperty('--py', y - 0.5);
    }, { passive: true });
  }

  // 2. 3D Tilt & Light Flare on Product Cards and Arches
  var lastTilt = null;
  function resetTilt() {
    if (lastTilt) {
      lastTilt.style.setProperty('--rx', '0deg');
      lastTilt.style.setProperty('--ry', '0deg');
      lastTilt = null;
    }
  }

  d.addEventListener('pointermove', function (e) {
    if (!fine || rm) return;
    var target = e.target.closest && e.target.closest('.item, .arch');
    if (target !== lastTilt) resetTilt();
    if (!target) return;
    lastTilt = target;
    var rect = target.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width - 0.5;
    var y = (e.clientY - rect.top) / rect.height - 0.5;
    target.style.setProperty('--ry', (x * 8) + 'deg');
    target.style.setProperty('--rx', (-y * 8) + 'deg');
    target.style.setProperty('--gx', ((x + 0.5) * 100) + '%');
    target.style.setProperty('--gy', ((y + 0.5) * 100) + '%');
  });

  d.addEventListener('pointerleave', resetTilt, true);

  // 3. Scroll Reveal Observer
  if ('IntersectionObserver' in window) {
    r.classList.add('js');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    function observeElements() {
      var elements = d.querySelectorAll(
        '.head, .item, .terms > div, .index a, .statement p, .yt, .ln, .sum, .pdp > div, .cols > div, .hero > div, .narrow, #cform'
      );
      elements.forEach(function (el) {
        if (!el.classList.contains('rv')) {
          el.classList.add('rv');
          io.observe(el);
        }
      });
    }

    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', observeElements);
    } else {
      observeElements();
    }
  }

  // 4. Toast Notification System
  window.showToast = function (msg) {
    var toast = d.getElementById('toast');
    if (!toast) {
      toast = d.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      d.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(function () {
      toast.classList.remove('on');
    }, 2200);
  };

  // 5. Bust Calculator on Size Guide page
  var bustInput = d.getElementById('bust');
  var bustResult = d.getElementById('fres');
  var SIZES_CHART = [
    ['M', 36],
    ['L', 38],
    ['XL', 40],
    ['XXL', 42],
    ['3XL', 44]
  ];

  if (bustInput && bustResult) {
    bustInput.addEventListener('input', function () {
      var val = parseFloat(bustInput.value);
      if (!val) {
        bustResult.textContent = bustResult.dataset.default || 'Your recommended size will appear here.';
        return;
      }
      if (val < 30 || val > 56) {
        bustResult.textContent = 'Please enter a bust measurement between 30 and 56 inches.';
        return;
      }
      var recommended = null;
      for (var i = 0; i < SIZES_CHART.length; i++) {
        if (val <= SIZES_CHART[i][1] + 1) {
          recommended = SIZES_CHART[i][0];
          break;
        }
      }
      if (recommended) {
        bustResult.textContent = 'Recommended size: ' + recommended + '. If between sizes or seeking relaxed comfort, message us before ordering.';
      } else {
        bustResult.textContent = 'Your measurement is above 3XL. Please message our WhatsApp for custom queries.';
      }
    });
  }

  // 6. Header Shrink on Scroll (> 40px)
  var header = d.getElementById('siteHeader');
  if (header) {
    var checkScroll = function () {
      if (window.scrollY > 40) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    };
    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
  }

  // 7. Account Dropdown
  var accBtn = d.getElementById('accBtn');
  var accDropdown = d.getElementById('accDropdown');
  if (accBtn && accDropdown) {
    accBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = !accDropdown.hidden;
      if (isOpen) {
        accDropdown.hidden = true;
        accBtn.setAttribute('aria-expanded', 'false');
      } else {
        accDropdown.hidden = false;
        accBtn.setAttribute('aria-expanded', 'true');
      }
    });

    d.addEventListener('click', function (e) {
      if (!accDropdown.hidden && !accDropdown.contains(e.target) && e.target !== accBtn && !accBtn.contains(e.target)) {
        accDropdown.hidden = true;
        accBtn.setAttribute('aria-expanded', 'false');
      }
    });

    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !accDropdown.hidden) {
        accDropdown.hidden = true;
        accBtn.setAttribute('aria-expanded', 'false');
        accBtn.focus();
      }
    });
  }

  // 8. Mobile Drawer (< 980px) & Focus Trap
  var burgerBtn = d.getElementById('burgerBtn');
  var drawerClose = d.getElementById('drawerClose');
  var mobileDrawer = d.getElementById('mobileDrawer');
  var drawerOverlay = d.getElementById('drawerOverlay');

  function openDrawer() {
    if (!mobileDrawer || !drawerOverlay) return;
    mobileDrawer.hidden = false;
    drawerOverlay.hidden = false;
    if (burgerBtn) burgerBtn.setAttribute('aria-expanded', 'true');
    d.body.style.overflow = 'hidden';
    var firstFocusable = mobileDrawer.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
  }

  function closeDrawer() {
    if (!mobileDrawer || !drawerOverlay) return;
    mobileDrawer.hidden = true;
    drawerOverlay.hidden = true;
    if (burgerBtn) {
      burgerBtn.setAttribute('aria-expanded', 'false');
      burgerBtn.focus();
    }
    d.body.style.overflow = '';
  }

  if (burgerBtn) burgerBtn.addEventListener('click', openDrawer);
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileDrawer && !mobileDrawer.hidden) {
      closeDrawer();
    }
  });

  if (mobileDrawer) {
    mobileDrawer.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusables = mobileDrawer.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && d.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && d.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // 9. Synchronized Theme Toggles (Light / Dark)
  function applyTheme(theme) {
    r.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('nest_theme', theme);
    } catch (e) {}

    var isDark = theme === 'dark';
    var icon = isDark ? '☼' : '☾';
    var text = isDark ? 'Light theme' : 'Dark theme';

    var ddIcon = d.getElementById('ddThemeIcon');
    var ddText = d.getElementById('ddThemeText');
    if (ddIcon) ddIcon.textContent = icon;
    if (ddText) ddText.textContent = text;

    var drawerIcon = d.getElementById('drawerThemeIcon');
    var drawerText = d.getElementById('drawerThemeText');
    if (drawerIcon) drawerIcon.textContent = icon;
    if (drawerText) drawerText.textContent = text;

    var footerBtn = d.getElementById('footerThemeToggle');
    if (footerBtn) {
      var fi = footerBtn.querySelector('.theme-icon');
      var ft = footerBtn.querySelector('.theme-text');
      if (fi) fi.textContent = icon;
      if (ft) ft.textContent = text;
    }

    var oldThemeBtn = d.getElementById('theme-toggle');
    if (oldThemeBtn) {
      oldThemeBtn.textContent = icon;
      oldThemeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  function handleThemeToggle() {
    var current = r.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  // Bind all theme toggles
  ['ddThemeToggle', 'drawerThemeToggle', 'footerThemeToggle', 'theme-toggle'].forEach(function (id) {
    var el = d.getElementById(id);
    if (el) {
      el.addEventListener('click', handleThemeToggle);
    }
  });

  // Restore saved theme on startup
  try {
    var savedTheme = localStorage.getItem('nest_theme');
    if (savedTheme) {
      applyTheme(savedTheme);
    }
  } catch (e) {}

  // 10. Wishlist Storage Sync & Count Badges
  function getWishlist() {
    try {
      return JSON.parse(localStorage.getItem('nest_wish') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveWishlist(items) {
    try {
      localStorage.setItem('nest_wish', JSON.stringify(items));
    } catch (e) {}
    updateWishlistBadges();
  }

  function updateWishlistBadges() {
    var wish = getWishlist();
    var count = wish.length;
    var countElements = d.querySelectorAll('.wish-count, #wc, [data-badge="wish"]');
    countElements.forEach(function (el) {
      el.textContent = count;
      el.setAttribute('data-zero', count === 0 ? 'true' : 'false');
    });

    // Update heart icons on page
    d.querySelectorAll('[data-wish-id]').forEach(function (btn) {
      var id = btn.getAttribute('data-wish-id');
      var isWished = wish.indexOf(id) > -1;
      btn.textContent = isWished ? '♥' : '♡';
      btn.setAttribute('aria-pressed', isWished ? 'true' : 'false');
      btn.title = isWished ? 'Remove from wishlist' : 'Save to wishlist';
    });
  }

  window.toggleWishlist = function (productId, productName) {
    var wish = getWishlist();
    var idx = wish.indexOf(productId);
    var added = false;
    if (idx > -1) {
      wish.splice(idx, 1);
    } else {
      wish.push(productId);
      added = true;
    }
    saveWishlist(wish);
    window.showToast(added ? 'Saved to wishlist' : 'Removed from wishlist');
    if (d.body.classList.contains('page-wishlist')) {
      location.reload();
    }
  };

  d.addEventListener('click', function (e) {
    var wishBtn = e.target.closest && e.target.closest('[data-wish-id]');
    if (wishBtn) {
      e.preventDefault();
      var id = wishBtn.getAttribute('data-wish-id');
      var name = wishBtn.getAttribute('data-wish-name') || 'Design';
      window.toggleWishlist(id, name);
    }
  });

  // 11. Cart Storage Helper & Count Badges
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('nest_cart') || '[]');
    } catch (e) {
      return [];
    }
  }

  window.getCart = getCart;

  window.saveCart = function (cart) {
    try {
      localStorage.setItem('nest_cart', JSON.stringify(cart));
    } catch (e) {}
    updateCartBadges();
  };

  function updateCartBadges() {
    var cart = getCart();
    var count = cart.reduce(function (total, item) {
      return total + (item.quantity || 1);
    }, 0);
    var countElements = d.querySelectorAll('.cart-count, #cc, [data-badge="cart"]');
    countElements.forEach(function (el) {
      el.textContent = count;
      el.setAttribute('data-zero', count === 0 ? 'true' : 'false');
    });
  }

  window.updateCartBadges = updateCartBadges;

  // Initialize badges on page load
  d.addEventListener('DOMContentLoaded', function () {
    updateWishlistBadges();
    updateCartBadges();
  });

})();

