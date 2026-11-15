/* public/js/cart-page.js
   Load with:  <script src="/js/cart-page.js" defer></script>
   It MUST come AFTER /js/cart-store.js in the page, so window.CartStore exists.

   Expects window.CartStore to provide:
     getItems()                          -> stored items [{productId, size, qty}]
     validate(cb)                        -> cb(err, {items, subtotal, shipping, total})
                                            each item: {productId, slug, name, image, size, price, qty, stock, lineTotal}
     removeItem(productId, size)
     updateQty(productId, size, qty)
   and to dispatch a "cart:updated" event on window after every change. */
(function () {
  'use strict';

  var box = document.getElementById('cart-container');
  if (!box) return;

  var pending = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function inr(n) { return '\u20B9' + Number(n || 0).toLocaleString('en-IN'); }
  function toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }
  function clear() { while (box.firstChild) box.removeChild(box.firstChild); }

  function message(text, withRetry) {
    clear();
    var w = el('div', 'cart-empty');
    w.style.cssText = 'text-align:center;padding:48px 0;color:var(--muted)';
    var p = el('p', '', text);
    p.style.cssText = 'font-size:1.1rem;margin-bottom:18px';
    w.appendChild(p);
    if (withRetry) {
      var b = el('button', 'btn', 'Try again');
      b.type = 'button';
      b.addEventListener('click', render);
      w.appendChild(b);
    } else {
      var a = el('a', 'btn', 'Continue shopping');
      a.href = '/shop';
      w.appendChild(a);
    }
    box.appendChild(w);
  }

  function qtyControl(item) {
    var q = el('div', 'qty');
    q.style.marginTop = '8px';
    var minus = el('button', '', '\u2212');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Decrease quantity');
    minus.addEventListener('click', function () {
      if (item.qty > 1) window.CartStore.updateQty(item.productId, item.size, item.qty - 1);
    });
    var n = el('span', '', String(item.qty));
    var plus = el('button', '', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Increase quantity');
    plus.addEventListener('click', function () {
      var max = Math.min(parseInt(item.stock, 10) || 10, 10);
      if (item.qty < max) window.CartStore.updateQty(item.productId, item.size, item.qty + 1);
      else toast('Maximum available quantity reached (' + max + ')');
    });
    q.appendChild(minus); q.appendChild(n); q.appendChild(plus);
    return q;
  }

  function row(item) {
    var r = el('div', 'ln');

    var a = el('a', 'th');
    a.href = '/product/' + encodeURIComponent(item.slug);
    var img = document.createElement('img');
    img.src = item.image; img.alt = item.name; img.loading = 'lazy';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
    a.appendChild(img);

    var mid = el('div');
    mid.appendChild(el('b', '', item.name));
    mid.appendChild(el('small', '', 'Size: ' + item.size + ' \u00B7 ' + inr(item.price)));
    mid.appendChild(qtyControl(item));

    var end = el('div', 'end');
    end.appendChild(el('span', 'price', inr(item.lineTotal)));
    var rm = el('button', '', 'Remove');
    rm.type = 'button';
    rm.addEventListener('click', function () {
      window.CartStore.removeItem(item.productId, item.size);
      toast('Item removed');
    });
    end.appendChild(rm);

    r.appendChild(a); r.appendChild(mid); r.appendChild(end);
    return r;
  }

  function summary(data) {
    var s = el('div', 'sum');
    s.appendChild(el('h3', '', 'Order summary'));
    [['Subtotal', data.subtotal, ''], ['Flat shipping', data.shipping, ''], ['Total', data.total, ' t']].forEach(function (x) {
      var r = el('div', 'r' + x[2]);
      r.appendChild(el('span', '', x[0]));
      r.appendChild(el('span', '', inr(x[1])));
      s.appendChild(r);
    });
    var go = el('a', 'btn', 'Proceed to checkout');
    go.href = '/checkout';
    go.style.cssText = 'margin-top:20px;width:100%;text-align:center';
    s.appendChild(go);
    var note = el('small', '', 'Prepaid orders only. No returns, exchanges, or size changes.');
    note.style.cssText = 'display:block;margin-top:14px;color:var(--muted);font-size:.82rem;text-align:center';
    s.appendChild(note);
    return s;
  }

  function draw(data) {
    clear();
    var wrap = el('div', 'two2');
    var list = el('div');
    data.items.forEach(function (it) { list.appendChild(row(it)); });
    wrap.appendChild(list);
    wrap.appendChild(summary(data));
    box.appendChild(wrap);
  }

  function render() {
    try {
      var cs = window.CartStore;
      if (!cs) { message('The cart could not be loaded.', true); return; }
      var stored = cs.getItems();
      if (!stored || !stored.length) { message('Your cart is empty.', false); return; }
      box.setAttribute('aria-busy', 'true');
      cs.validate(function (err, data) {
        box.removeAttribute('aria-busy');
        if (err || !data) { message('We could not load your cart. Please try again.', true); return; }
        if (!data.items || !data.items.length) { message('Your cart is empty.', false); return; }
        draw(data);
      });
    } catch (e) {
      box.removeAttribute('aria-busy');
      if (window.console) console.error('Cart render failed', e);
      message('Something went wrong showing your cart.', true);
    }
  }

  // One render per change, even if several events fire together
  function schedule() { clearTimeout(pending); pending = setTimeout(render, 0); }

  window.addEventListener('cart:updated', schedule);
  window.addEventListener('storage', schedule);                       // other tabs
  window.addEventListener('pageshow', function (e) { if (e.persisted) schedule(); }); // back button

  render();
})();

