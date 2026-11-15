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

  // 6. Wishlist Button Click Delegation
  d.addEventListener('click', function (e) {
    var wishBtn = e.target.closest && e.target.closest('[data-wish-id]');
    if (wishBtn) {
      e.preventDefault();
      var id = wishBtn.getAttribute('data-wish-id');
      var name = wishBtn.getAttribute('data-wish-name') || 'Design';
      if (window.WishlistStore) {
        window.WishlistStore.toggle(id, name);
      }
    }
  });

  // 7. Cart & Wishlist Compatibility Delegates
  window.getWishlist = function () {
    return window.WishlistStore ? window.WishlistStore.getItems() : [];
  };

  window.getCart = function () {
    return window.CartStore ? window.CartStore.getItems() : [];
  };

  window.saveCart = function (items) {
    return window.CartStore ? window.CartStore.saveItems(items) : [];
  };

  window.updateCartBadges = function () {
    if (window.CartStore) {
      window.CartStore.init();
    }
  };

})();

