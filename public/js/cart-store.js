/**
 * Nest by Ammakkili - Cart Store
 * Single source of truth for shopping cart state.
 * Encapsulates all reads/writes to localStorage under 'nest_cart'.
 */
(function (window) {
  'use strict';

  var STORAGE_KEY = 'nest_cart';

  function getStorage() {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  function safeGet() {
    try {
      var storage = getStorage();
      if (!storage) return [];
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(function (it) {
          var pid = String(it.productId || it.id || '').trim();
          var sz = String(it.size || '').trim();
          var q = Math.max(1, parseInt(it.qty || it.quantity, 10) || 1);
          return { productId: pid, size: sz, qty: q };
        })
        .filter(function (it) {
          return it.productId && it.size;
        });
    } catch (e) {
      return [];
    }
  }

  function safeSet(items) {
    try {
      var storage = getStorage();
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {}
  }

  function updateBadge(totalQty) {
    var count = Math.max(0, parseInt(totalQty, 10) || 0);
    if (window.NestHeader && typeof window.NestHeader.setCart === 'function') {
      window.NestHeader.setCart(count);
    } else {
      var el = document.getElementById('cartBadge');
      if (el) {
        el.textContent = count > 99 ? '99+' : String(count);
        el.setAttribute('data-zero', count === 0 ? 'true' : 'false');
      }
    }
  }

  function getCsrfToken() {
    var csrfEl = document.querySelector('meta[name="csrf-token"]');
    return csrfEl ? (csrfEl.getAttribute('content') || '') : '';
  }

  var CartStore = {
    /**
     * Get all items in cart as [{productId, size, qty}]
     */
    getItems: function () {
      return safeGet();
    },

    /**
     * Compute sum of quantities
     */
    getTotalQty: function (items) {
      var list = items || safeGet();
      return list.reduce(function (sum, it) {
        return sum + (parseInt(it.qty, 10) || 0);
      }, 0);
    },

    /**
     * Save items to storage, notify badge, dispatch cart:updated event
     */
    saveItems: function (items) {
      var sanitized = (items || []).map(function (it) {
        return {
          productId: String(it.productId || it.id || '').trim(),
          size: String(it.size || '').trim(),
          qty: Math.max(1, parseInt(it.qty || it.quantity, 10) || 1)
        };
      }).filter(function (it) {
        return it.productId && it.size;
      });

      safeSet(sanitized);
      var total = CartStore.getTotalQty(sanitized);
      updateBadge(total);

      window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: sanitized, totalQty: total } }));
      return sanitized;
    },

    /**
     * Add item or increase quantity
     */
    addItem: function (productId, size, qty, maxStock) {
      var items = safeGet();
      var pid = String(productId).trim();
      var sz = String(size).trim();
      var addQty = Math.max(1, parseInt(qty, 10) || 1);

      var existing = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].productId === pid && items[i].size === sz) {
          existing = items[i];
          break;
        }
      }

      if (existing) {
        existing.qty += addQty;
        if (maxStock && existing.qty > maxStock) existing.qty = maxStock;
      } else {
        if (maxStock && addQty > maxStock) addQty = maxStock;
        items.push({ productId: pid, size: sz, qty: addQty });
      }

      return CartStore.saveItems(items);
    },

    /**
     * Update quantity of item by productId and size
     */
    updateQty: function (productId, size, qty) {
      var items = safeGet();
      var pid = String(productId).trim();
      var sz = String(size).trim();
      var q = parseInt(qty, 10);

      if (isNaN(q) || q <= 0) {
        return CartStore.removeItem(pid, sz);
      }

      var found = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].productId === pid && items[i].size === sz) {
          items[i].qty = q;
          found = true;
          break;
        }
      }

      if (!found) {
        items.push({ productId: pid, size: sz, qty: q });
      }

      return CartStore.saveItems(items);
    },

    /**
     * Remove item by productId and size
     */
    removeItem: function (productId, size) {
      var items = safeGet();
      var pid = String(productId).trim();
      var sz = String(size).trim();
      var filtered = items.filter(function (it) {
        return !(it.productId === pid && it.size === sz);
      });
      return CartStore.saveItems(filtered);
    },

    /**
     * Legacy index-based helpers
     */
    updateQtyByIndex: function (index, newQty) {
      var items = safeGet();
      if (index >= 0 && index < items.length) {
        var it = items[index];
        return CartStore.updateQty(it.productId, it.size, newQty);
      }
      return items;
    },

    removeItemByIndex: function (index) {
      var items = safeGet();
      if (index >= 0 && index < items.length) {
        var it = items[index];
        return CartStore.removeItem(it.productId, it.size);
      }
      return items;
    },

    /**
     * Clear all items from cart (e.g., after successful order)
     */
    clear: function () {
      try {
        var storage = getStorage();
        if (storage) storage.removeItem(STORAGE_KEY);
      } catch (e) {}
      updateBadge(0);
      window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: [], totalQty: 0 } }));
    },

    /**
     * Validate cart items with the server
     */
    validate: function (callback) {
      var currentItems = safeGet();
      if (!currentItems.length) {
        updateBadge(0);
        if (typeof callback === 'function') {
          callback(null, { items: [], subtotal: 0, shipping: 0, total: 0, removed: [] });
        }
        return;
      }

      var csrfToken = getCsrfToken();
      var fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch : fetch;

      fetchFn('/cart/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ items: currentItems })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Validation request failed: ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data && Array.isArray(data.items)) {
            var validStored = data.items.map(function (it) {
              return {
                productId: String(it.productId || it.id),
                size: String(it.size),
                qty: Math.max(1, parseInt(it.qty || it.quantity, 10) || 1)
              };
            });

            var hadItemsBefore = currentItems.length;
            var itemsRemoved = (Array.isArray(data.removed) && data.removed.length > 0) ||
                               (data.removedCount > 0) ||
                               (currentItems.length !== validStored.length);

            // Update localStorage with only valid items
            safeSet(validStored);
            var newTotal = CartStore.getTotalQty(validStored);
            updateBadge(newTotal);

            if (itemsRemoved && hadItemsBefore > 0) {
              var removedMsg = 'Some items are no longer available and were removed.';
              if (typeof window.showToast === 'function') {
                window.showToast(removedMsg);
              } else {
                var toastEl = document.getElementById('toast');
                if (toastEl) {
                  toastEl.textContent = removedMsg;
                  toastEl.classList.add('on');
                  clearTimeout(window._toastTimeout);
                  window._toastTimeout = setTimeout(function () {
                    toastEl.classList.remove('on');
                  }, 2200);
                }
              }
              // Dispatch cart:updated because storage changed due to invalid item pruning
              window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: validStored, totalQty: newTotal } }));
            }

            window.dispatchEvent(new CustomEvent('cart:validated', { detail: data }));
            if (typeof callback === 'function') callback(null, data);
          } else {
            if (typeof callback === 'function') callback(new Error('Invalid validation format'));
          }
        })
        .catch(function (err) {
          if (window.console && typeof console.warn === 'function') {
            console.warn('Cart validation network error:', err);
          }
          if (typeof callback === 'function') callback(err);
        });
    },

    /**
     * Initialize on page load: set initial badge, then validate against server
     */
    init: function () {
      var items = safeGet();
      var total = CartStore.getTotalQty(items);
      updateBadge(total);

      if (items.length > 0) {
        CartStore.validate();
      }
    }
  };

  // Cross-tab synchronization
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) {
      var items = safeGet();
      var total = CartStore.getTotalQty(items);
      updateBadge(total);
      window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items: items, totalQty: total } }));
    }
  });

  window.CartStore = CartStore;

  // Compatibility helpers
  window.getCart = function () { return CartStore.getItems(); };
  window.saveCart = function (items) { return CartStore.saveItems(items); };

  // Run on startup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { CartStore.init(); });
  } else {
    CartStore.init();
  }
})(window);
