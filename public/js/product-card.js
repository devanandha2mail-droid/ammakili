/**
 * Nest by Ammakkili - Product Card Interactions
 * Handles Quick Add popover, keyboard traps, and cart adding.
 */
(function () {
  'use strict';

  var activePopover = null;
  var activeTrigger = null;

  function closePopover() {
    if (activePopover) {
      activePopover.hidden = true;
      if (activeTrigger) {
        activeTrigger.setAttribute('aria-expanded', 'false');
        activeTrigger.focus();
      }
      activePopover = null;
      activeTrigger = null;
    }
  }

  function openPopover(trigger, popover) {
    if (activePopover && activePopover !== popover) {
      closePopover();
    }
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    activePopover = popover;
    activeTrigger = trigger;

    // Focus first non-disabled size pill
    var firstPill = popover.querySelector('.p-card__size-pill:not([disabled])');
    if (firstPill) firstPill.focus();
  }

  document.addEventListener('click', function (e) {
    // 1. Click Quick Add trigger button
    var trigger = e.target.closest('.p-card__quick-add');
    if (trigger) {
      e.preventDefault();
      var card = trigger.closest('.p-card');
      if (!card) return;
      var popover = card.querySelector('.p-card__popover');
      if (!popover) return;

      if (popover.hidden) {
        openPopover(trigger, popover);
      } else {
        closePopover();
      }
      return;
    }

    // 2. Click Popover Close button
    var closeBtn = e.target.closest('.p-card__popover-close');
    if (closeBtn) {
      e.preventDefault();
      closePopover();
      return;
    }

    // 3. Click Size Pill in Quick Add
    var pill = e.target.closest('.p-card__size-pill');
    if (pill) {
      e.preventDefault();
      if (pill.disabled) return;

      var card = pill.closest('.p-card');
      var pid = card ? card.getAttribute('data-product-id') : null;
      var titleEl = card ? card.querySelector('.p-card__title a') : null;
      var name = titleEl ? titleEl.textContent.trim() : 'Nighty';
      var size = pill.getAttribute('data-size');
      var stock = parseInt(pill.getAttribute('data-stock'), 10) || 10;

      if (pid && size && window.CartStore) {
        window.CartStore.addItem(pid, size, 1, stock);
        if (typeof window.showToast === 'function') {
          window.showToast('Added ' + name + ' (' + size + ') to bag ✓');
        }
        // Trigger mini cart drawer if available
        window.dispatchEvent(new CustomEvent('cart:item-added', {
          detail: { productId: pid, size: size, name: name }
        }));
      }

      closePopover();
      return;
    }

    // 4. Click outside popover closes it
    if (activePopover && !e.target.closest('.p-card__popover') && !e.target.closest('.p-card__quick-add')) {
      closePopover();
    }
  });

  // Keyboard navigation & accessibility
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activePopover) {
      closePopover();
      return;
    }

    if (activePopover && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      var pills = Array.prototype.slice.call(activePopover.querySelectorAll('.p-card__size-pill:not([disabled])'));
      var idx = pills.indexOf(document.activeElement);
      if (idx !== -1) {
        e.preventDefault();
        var nextIdx = e.key === 'ArrowRight' ? (idx + 1) % pills.length : (idx - 1 + pills.length) % pills.length;
        pills[nextIdx].focus();
      }
    }
  });

  // Export helper to construct a DOM product card safely (for shop AJAX & load more)
  window.createProductCardElement = function (product, lang) {
    var isMl = lang === 'ml';
    var name = typeof product.getName === 'function' ? product.getName(lang) : (isMl && product.name && product.name.ml ? product.name.ml : (product.name && product.name.en ? product.name.en : (product.name || 'Nighty')));
    var img0 = (product.images && product.images.length > 0) ? product.images[0] : '/img/brand/logo-mark-256.png';
    var img1 = (product.images && product.images.length > 1) ? product.images[1] : null;

    var sizes = product.sizes || [];
    var isSoldOut = sizes.length === 0 || sizes.every(function (s) { return (s.stock || 0) <= 0; });
    var lowStockSize = !isSoldOut ? sizes.find(function (s) { return (s.stock || 0) > 0 && (s.stock || 0) <= 3; }) : null;

    var card = document.createElement('article');
    card.className = 'p-card' + (isSoldOut ? ' p-card--soldout' : '');
    card.setAttribute('data-product-id', product._id);

    // Media wrap
    var media = document.createElement('div');
    media.className = 'p-card__media';

    var imgLink = document.createElement('a');
    imgLink.href = '/product/' + encodeURIComponent(product.slug);
    imgLink.className = 'p-card__img-link';
    imgLink.setAttribute('aria-label', name);

    var aspect = document.createElement('div');
    aspect.className = 'p-card__aspect';

    var primaryImg = document.createElement('img');
    primaryImg.className = 'p-card__img p-card__img--primary';
    primaryImg.src = img0;
    primaryImg.alt = name;
    primaryImg.loading = 'lazy';
    primaryImg.width = 400;
    primaryImg.height = 500;
    aspect.appendChild(primaryImg);

    if (img1) {
      var secondaryImg = document.createElement('img');
      secondaryImg.className = 'p-card__img p-card__img--secondary';
      secondaryImg.src = img1;
      secondaryImg.alt = name + ' alternate view';
      secondaryImg.loading = 'lazy';
      secondaryImg.width = 400;
      secondaryImg.height = 500;
      aspect.appendChild(secondaryImg);
    }
    imgLink.appendChild(aspect);
    media.appendChild(imgLink);

    // Pill
    if (isSoldOut) {
      var pill = document.createElement('span');
      pill.className = 'p-card__pill p-card__pill--soldout';
      pill.textContent = isMl ? 'തീർന്നുപോയി' : 'Sold out';
      media.appendChild(pill);
    } else if (product.tag && product.tag !== 'None' && product.tag.trim() !== '') {
      var tagPill = document.createElement('span');
      tagPill.className = 'p-card__pill p-card__pill--' + product.tag.toLowerCase();
      tagPill.textContent = product.tag;
      media.appendChild(tagPill);
    }

    // Heart button
    var heart = document.createElement('button');
    heart.type = 'button';
    heart.className = 'p-card__heart';
    heart.setAttribute('data-wish-id', product._id);
    heart.setAttribute('data-wish-name', name);
    heart.setAttribute('aria-label', 'Save ' + name + ' to wishlist');
    heart.setAttribute('aria-pressed', 'false');
    heart.textContent = '♡';
    media.appendChild(heart);

    // Quick add
    if (!isSoldOut && sizes.length > 0) {
      var quickBtn = document.createElement('button');
      quickBtn.type = 'button';
      quickBtn.className = 'p-card__quick-add';
      quickBtn.setAttribute('aria-haspopup', 'dialog');
      quickBtn.setAttribute('aria-expanded', 'false');
      quickBtn.setAttribute('aria-label', 'Quick add ' + name);
      quickBtn.textContent = isMl ? 'പെട്ടെന്ന് ചേർക്കുക' : 'Quick add';
      media.appendChild(quickBtn);

      var popover = document.createElement('div');
      popover.className = 'p-card__popover';
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', 'Select size for ' + name);
      popover.hidden = true;

      var head = document.createElement('div');
      head.className = 'p-card__popover-head';
      var headSpan = document.createElement('span');
      headSpan.textContent = isMl ? 'സൈസ് തിരഞ്ഞെടുക്കുക' : 'Select size';
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'p-card__popover-close';
      closeBtn.setAttribute('aria-label', 'Close quick add');
      closeBtn.textContent = '✕';
      head.appendChild(headSpan);
      head.appendChild(closeBtn);
      popover.appendChild(head);

      var sizesDiv = document.createElement('div');
      sizesDiv.className = 'p-card__sizes';
      sizes.forEach(function (s) {
        var out = (s.stock || 0) <= 0;
        var low = !out && (s.stock || 0) <= 3;
        var szBtn = document.createElement('button');
        szBtn.type = 'button';
        szBtn.className = 'p-card__size-pill' + (out ? ' is-out' : '') + (low ? ' is-low' : '');
        szBtn.setAttribute('data-size', s.size);
        szBtn.setAttribute('data-stock', s.stock);
        if (out) szBtn.disabled = true;
        szBtn.title = out ? 'Sold out' : (low ? ('Only ' + s.stock + ' left') : 'In stock');
        szBtn.textContent = s.size;
        sizesDiv.appendChild(szBtn);
      });
      popover.appendChild(sizesDiv);
      media.appendChild(popover);
    }
    card.appendChild(media);

    // Info
    var info = document.createElement('div');
    info.className = 'p-card__info';

    var styleDiv = document.createElement('div');
    styleDiv.className = 'p-card__style';
    styleDiv.textContent = product.style || 'Cotton';
    info.appendChild(styleDiv);

    var title = document.createElement('h3');
    title.className = 'p-card__title';
    var titleLink = document.createElement('a');
    titleLink.href = '/product/' + encodeURIComponent(product.slug);
    titleLink.textContent = name;
    title.appendChild(titleLink);
    info.appendChild(title);

    var priceDiv = document.createElement('div');
    priceDiv.className = 'p-card__price';
    var priceNum = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
    priceDiv.textContent = '₹' + priceNum.toLocaleString('en-IN');
    info.appendChild(priceDiv);

    if (lowStockSize) {
      var note = document.createElement('div');
      note.className = 'p-card__stock-note';
      note.textContent = isMl
        ? (lowStockSize.size + '-ൽ ' + lowStockSize.stock + ' എണ്ണം മാത്രം ബാക്കി')
        : ('Only ' + lowStockSize.stock + ' left in ' + lowStockSize.size);
      info.appendChild(note);
    }
    card.appendChild(info);

    // Sync wishlist state if WishlistStore exists
    if (window.WishlistStore && typeof window.WishlistStore.getItems === 'function') {
      var wishItems = window.WishlistStore.getItems();
      if (wishItems.indexOf(product._id) !== -1) {
        heart.textContent = '♥';
        heart.setAttribute('aria-pressed', 'true');
      }
    }

    return card;
  };

})();

