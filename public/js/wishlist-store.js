/**
 * Nest by Ammakkili - Wishlist Store
 * Single source of truth for customer wishlist state.
 * Encapsulates all reads/writes to localStorage under 'nest_wish'.
 */
(function (window) {
  'use strict';

  var STORAGE_KEY = 'nest_wish';

  function safeGet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(function (id) { return String(id || '').trim(); })
        .filter(function (id) { return id.length > 0; });
    } catch (e) {
      return [];
    }
  }

  function safeSet(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {}
  }

  function updateBadge(count) {
    count = Math.max(0, parseInt(count, 10) || 0);
    if (window.NestHeader && typeof window.NestHeader.setWishlist === 'function') {
      window.NestHeader.setWishlist(count);
    } else {
      var el = document.getElementById('wishBadge');
      if (el) {
        el.textContent = count > 99 ? '99+' : String(count);
        el.setAttribute('data-zero', count === 0 ? 'true' : 'false');
      }
    }
  }

  function syncHeartButtons(items) {
    var set = new Set(items);
    document.querySelectorAll('[data-wish-id]').forEach(function (btn) {
      var id = btn.getAttribute('data-wish-id');
      var isWished = set.has(id);
      btn.textContent = isWished ? '♥' : '♡';
      btn.setAttribute('aria-pressed', isWished ? 'true' : 'false');
      btn.title = isWished ? 'Remove from wishlist' : 'Save to wishlist';
    });
  }

  var WishlistStore = {
    getItems: function () {
      return safeGet();
    },

    hasItem: function (productId) {
      var items = safeGet();
      return items.indexOf(String(productId).trim()) > -1;
    },

    saveItems: function (items) {
      var unique = Array.from(new Set((items || []).map(function (id) { return String(id || '').trim(); }))).filter(Boolean);
      safeSet(unique);
      updateBadge(unique.length);
      syncHeartButtons(unique);
      window.dispatchEvent(new CustomEvent('wishlist:updated', { detail: { items: unique } }));
      return unique;
    },

    toggle: function (productId, productName) {
      var pid = String(productId).trim();
      if (!pid) return;
      var items = safeGet();
      var idx = items.indexOf(pid);
      var added = false;
      if (idx > -1) {
        items.splice(idx, 1);
      } else {
        items.push(pid);
        added = true;
      }
      WishlistStore.saveItems(items);
      if (typeof window.showToast === 'function') {
        window.showToast(added ? 'Saved to wishlist' : 'Removed from wishlist');
      }
      return added;
    },

    clear: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      updateBadge(0);
      syncHeartButtons([]);
      window.dispatchEvent(new CustomEvent('wishlist:updated', { detail: { items: [] } }));
    },

    validate: function (callback) {
      var items = safeGet();
      if (!items.length) {
        updateBadge(0);
        syncHeartButtons([]);
        if (typeof callback === 'function') callback(null, []);
        return;
      }

      fetch('/api/wishlist-items?ids=' + encodeURIComponent(items.join(',')))
        .then(function (res) {
          if (!res.ok) throw new Error('Wishlist fetch error: ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data && Array.isArray(data.products)) {
            var validIds = data.products.map(function (p) { return String(p.id); });
            var hadBefore = items.length;
            var changed = validIds.length !== hadBefore;

            safeSet(validIds);
            updateBadge(validIds.length);
            syncHeartButtons(validIds);

            window.dispatchEvent(new CustomEvent('wishlist:validated', { detail: data }));
            if (typeof callback === 'function') callback(null, data.products);
          } else {
            if (typeof callback === 'function') callback(new Error('Invalid response'));
          }
        })
        .catch(function (err) {
          console.warn('Wishlist validation network error:', err);
          if (typeof callback === 'function') callback(err);
        });
    },

    init: function () {
      var items = safeGet();
      updateBadge(items.length);
      syncHeartButtons(items);

      if (items.length > 0) {
        WishlistStore.validate();
      }
    }
  };

  // Cross-tab synchronization
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) {
      var items = safeGet();
      updateBadge(items.length);
      syncHeartButtons(items);
      window.dispatchEvent(new CustomEvent('wishlist:updated', { detail: { items: items } }));
    }
  });

  window.WishlistStore = WishlistStore;
  window.toggleWishlist = function (id, name) {
    return WishlistStore.toggle(id, name);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { WishlistStore.init(); });
  } else {
    WishlistStore.init();
  }
})(window);
