/**
 * Nest by Ammakkili - Product Detail Page Interactions
 * Gallery hover zoom, lightbox with swipe/keys, size radiogroup, size guide drawer,
 * mini cart drawer, mobile sticky CTA, and WhatsApp links.
 */
(function () {
  'use strict';

  function initPDP() {
    var pdpWrap = document.querySelector('.pdp-section');
    if (!pdpWrap) return;

    var lang = document.documentElement.lang || 'en';
    var isMl = lang === 'ml';

    // Elements
    var mainImage = document.getElementById('pdpMainImage');
    var mainFrame = document.getElementById('pdpMainFrame');
    var zoomLayer = document.getElementById('pdpZoomLayer');
    var thumbBtns = document.querySelectorAll('.pdp-thumb-btn');
    var sizePills = document.querySelectorAll('.pdp-size-pill');
    var sizeWarning = document.getElementById('pdpSizeWarning');
    var sizeRow = document.getElementById('pdpSizeRadiogroup');
    var qtyVal = document.getElementById('pdpQtyVal');
    var qtyMinus = document.getElementById('pdpQtyMinus');
    var qtyPlus = document.getElementById('pdpQtyPlus');
    var addBtn = document.getElementById('pdpAddToCartBtn');
    var mobileStickyBar = document.getElementById('pdpMobileStickyBar');
    var mobileStickyAddBtn = document.getElementById('pdpMobileStickyAddBtn');
    var askWaLink = document.getElementById('pdpAskWaLink');

    // Drawers
    var sizeDrawer = document.getElementById('pdpSizeDrawer');
    var sizeDrawerOpenBtn = document.getElementById('pdpOpenSizeDrawer');
    var sizeDrawerCloseBtn = document.getElementById('pdpCloseSizeDrawer');
    var drawerBackdrop = document.getElementById('pdpDrawerBackdrop');

    var miniCartDrawer = document.getElementById('pdpMiniCartDrawer');
    var miniCartCloseBtn = document.getElementById('pdpCloseMiniCart');
    var miniCartItemsList = document.getElementById('pdpMiniCartItems');
    var miniCartSubtotal = document.getElementById('pdpMiniCartSubtotal');

    // Lightbox elements
    var lightbox = document.getElementById('pdpLightbox');
    var lightboxImg = document.getElementById('pdpLightboxImg');
    var lightboxCloseBtn = document.getElementById('pdpLightboxClose');
    var lightboxPrevBtn = document.getElementById('pdpLightboxPrev');
    var lightboxNextBtn = document.getElementById('pdpLightboxNext');

    var productId = pdpWrap.getAttribute('data-product-id');
    var productName = pdpWrap.getAttribute('data-product-name');
    var productPrice = parseFloat(pdpWrap.getAttribute('data-product-price')) || 0;
    var waNumber = pdpWrap.getAttribute('data-wa-number') || '919876543210';

    var selectedSize = '';
    var selectedStock = 0;
    var quantity = 1;
    var currentSlideIdx = 0;
    var slidesData = []; // Array of { type: 'img'|'video', src, alt }

    // Build slides array from thumbnail buttons
    thumbBtns.forEach(function (btn, idx) {
      var type = btn.getAttribute('data-slide-type') || 'img';
      var src = btn.getAttribute('data-src') || '';
      var alt = btn.getAttribute('data-alt') || productName;
      var videoEmbed = btn.getAttribute('data-video-embed') || '';
      slidesData.push({ type: type, src: src, alt: alt, videoEmbed: videoEmbed });
    });

    // ----------------------------------------------------
    // 1. Gallery Thumbnail Navigation & YouTube Slide
    // ----------------------------------------------------
    function switchSlide(idx) {
      if (idx < 0 || idx >= slidesData.length) return;
      currentSlideIdx = idx;
      var slide = slidesData[idx];

      thumbBtns.forEach(function (b, i) {
        var active = i === idx;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      var videoContainer = document.getElementById('pdpVideoContainer');

      if (slide.type === 'video') {
        if (mainImage) mainImage.hidden = true;
        if (zoomLayer) zoomLayer.style.display = 'none';
        if (videoContainer) {
          videoContainer.hidden = false;
        }
      } else {
        if (videoContainer) {
          videoContainer.hidden = true;
          // reset video iframe if playing
          var iframe = videoContainer.querySelector('iframe');
          if (iframe) iframe.remove();
          var posterWrap = videoContainer.querySelector('.pdp-video-poster');
          if (posterWrap) posterWrap.hidden = false;
        }
        if (mainImage) {
          mainImage.hidden = false;
          mainImage.src = slide.src;
          mainImage.alt = slide.alt;
        }
        if (zoomLayer) {
          zoomLayer.style.backgroundImage = 'url("' + slide.src + '")';
          zoomLayer.style.display = '';
        }
      }
    }

    thumbBtns.forEach(function (btn, idx) {
      btn.addEventListener('click', function () {
        switchSlide(idx);
      });
    });

    // Handle YouTube play button click (loads iframe on demand with youtube-nocookie.com)
    var videoPlayBtn = document.getElementById('pdpVideoPlayBtn');
    if (videoPlayBtn) {
      videoPlayBtn.addEventListener('click', function () {
        var embedUrl = videoPlayBtn.getAttribute('data-embed-url');
        if (!embedUrl) return;
        var poster = document.getElementById('pdpVideoPoster');
        if (poster) poster.hidden = true;

        var iframeWrap = document.getElementById('pdpVideoIframeWrap');
        if (iframeWrap) {
          iframeWrap.innerHTML = '';
          var iframe = document.createElement('iframe');
          iframe.src = embedUrl;
          iframe.title = productName + ' Video';
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          iframe.className = 'pdp-video-iframe';
          iframeWrap.appendChild(iframe);
        }
      });
    }

    // ----------------------------------------------------
    // 2. Desktop 2x Hover Zoom
    // ----------------------------------------------------
    var isFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (isFinePointer && mainFrame && zoomLayer) {
      mainFrame.addEventListener('mouseenter', function () {
        if (slidesData[currentSlideIdx] && slidesData[currentSlideIdx].type === 'video') return;
        zoomLayer.style.opacity = '1';
      });

      mainFrame.addEventListener('mousemove', function (e) {
        if (slidesData[currentSlideIdx] && slidesData[currentSlideIdx].type === 'video') return;
        var rect = mainFrame.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        zoomLayer.style.backgroundPosition = x + '% ' + y + '%';
      });

      mainFrame.addEventListener('mouseleave', function () {
        zoomLayer.style.opacity = '0';
      });
    }

    // ----------------------------------------------------
    // 3. Full-Screen Lightbox
    // ----------------------------------------------------
    var lightboxIdx = 0;
    var imageSlides = slidesData.filter(function (s) { return s.type === 'img'; });

    function openLightbox(idx) {
      if (!lightbox || imageSlides.length === 0) return;
      lightboxIdx = (idx >= 0 && idx < imageSlides.length) ? idx : 0;
      updateLightboxImage();
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
      if (lightboxCloseBtn) lightboxCloseBtn.focus();
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.hidden = true;
      document.body.style.overflow = '';
      if (mainFrame) mainFrame.focus();
    }

    function updateLightboxImage() {
      if (!lightboxImg || !imageSlides[lightboxIdx]) return;
      lightboxImg.src = imageSlides[lightboxIdx].src;
      lightboxImg.alt = imageSlides[lightboxIdx].alt;
    }

    if (mainFrame) {
      mainFrame.addEventListener('click', function (e) {
        if (slidesData[currentSlideIdx] && slidesData[currentSlideIdx].type === 'video') return;
        openLightbox(currentSlideIdx);
      });
    }

    if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
    if (lightboxPrevBtn) {
      lightboxPrevBtn.addEventListener('click', function () {
        lightboxIdx = (lightboxIdx - 1 + imageSlides.length) % imageSlides.length;
        updateLightboxImage();
      });
    }
    if (lightboxNextBtn) {
      lightboxNextBtn.addEventListener('click', function () {
        lightboxIdx = (lightboxIdx + 1) % imageSlides.length;
        updateLightboxImage();
      });
    }

    // Touch swipe for Lightbox
    var touchStartX = 0;
    var touchEndX = 0;
    if (lightbox) {
      lightbox.addEventListener('touchstart', function (e) {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      lightbox.addEventListener('touchend', function (e) {
        touchEndX = e.changedTouches[0].screenX;
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
          if (diff > 0) {
            // swipe left -> next
            lightboxIdx = (lightboxIdx + 1) % imageSlides.length;
          } else {
            // swipe right -> prev
            lightboxIdx = (lightboxIdx - 1 + imageSlides.length) % imageSlides.length;
          }
          updateLightboxImage();
        }
      }, { passive: true });
    }

    // ----------------------------------------------------
    // 4. Size Selector (Accessible Radiogroup)
    // ----------------------------------------------------
    function selectSize(pill) {
      if (pill.disabled || pill.classList.contains('is-sold-out')) return;

      sizePills.forEach(function (p) {
        p.classList.remove('is-selected');
        p.setAttribute('aria-checked', 'false');
      });

      pill.classList.add('is-selected');
      pill.setAttribute('aria-checked', 'true');
      pill.focus();

      selectedSize = pill.getAttribute('data-size');
      selectedStock = parseInt(pill.getAttribute('data-stock'), 10) || 0;

      // Reset qty if current qty > selectedStock
      if (quantity > selectedStock) {
        quantity = Math.max(1, selectedStock);
        if (qtyVal) qtyVal.textContent = quantity;
      }

      // Update warning / status note
      if (sizeWarning) {
        if (selectedStock > 0 && selectedStock <= 3) {
          sizeWarning.textContent = isMl
            ? ('ശ്രദ്ധിക്കുക: ' + selectedSize + '-ൽ ' + selectedStock + ' എണ്ണം മാത്രം ബാക്കി!')
            : ('Only ' + selectedStock + ' left in size ' + selectedSize + '!');
          sizeWarning.className = 'pdp-size-note pdp-size-note--warn';
        } else {
          sizeWarning.textContent = '';
          sizeWarning.className = 'pdp-size-note';
        }
      }

      // Hide WhatsApp enquiry link since this size is available
      if (askWaLink) {
        askWaLink.hidden = true;
      }
    }

    sizePills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        if (pill.disabled || pill.classList.contains('is-sold-out')) {
          // If clicked a sold-out size: show "Ask on WhatsApp" option!
          var sz = pill.getAttribute('data-size');
          if (askWaLink) {
            var msg = isMl
              ? ('നമസ്കാരം Nest by Ammakkili, ' + productName + ' (' + sz + ' സൈസ്) ലഭ്യമാണോ എന്ന് അറിയാൻ താല്പര്യമുണ്ട്.')
              : ('Hi Nest by Ammakkili, I would like to check availability for ' + productName + ' in size ' + sz + '.');
            askWaLink.href = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(msg);
            var spanText = askWaLink.querySelector('.pdp-wa-text');
            if (spanText) {
              spanText.textContent = isMl
                ? (sz + ' സൈസ് വാട്സാപ്പിൽ അന്വേഷിക്കുക')
                : ('Ask about size ' + sz + ' on WhatsApp');
            }
            askWaLink.hidden = false;
          }
          if (sizeWarning) {
            sizeWarning.textContent = isMl
              ? (sz + ' സൈസ് ഇപ്പോൾ ലഭ്യമല്ല.')
              : ('Size ' + sz + ' is currently sold out.');
            sizeWarning.className = 'pdp-size-note pdp-size-note--out';
          }
          return;
        }
        selectSize(pill);
      });
    });

    // Keyboard arrow navigation for Radiogroup
    if (sizeRow) {
      sizeRow.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          var availablePills = Array.prototype.slice.call(sizePills).filter(function (p) {
            return !p.disabled && !p.classList.contains('is-sold-out');
          });
          if (availablePills.length === 0) return;

          var curIdx = availablePills.indexOf(document.activeElement);
          if (curIdx === -1) {
            selectSize(availablePills[0]);
          } else {
            var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
            var nextIdx = (curIdx + dir + availablePills.length) % availablePills.length;
            selectSize(availablePills[nextIdx]);
          }
        }
      });
    }

    // ----------------------------------------------------
    // 5. Quantity Stepper
    // ----------------------------------------------------
    if (qtyMinus) {
      qtyMinus.addEventListener('click', function () {
        if (quantity > 1) {
          quantity--;
          if (qtyVal) qtyVal.textContent = quantity;
        }
      });
    }
    if (qtyPlus) {
      qtyPlus.addEventListener('click', function () {
        var max = selectedStock > 0 ? Math.min(10, selectedStock) : 10;
        if (quantity < max) {
          quantity++;
          if (qtyVal) qtyVal.textContent = quantity;
        } else if (selectedStock > 0) {
          if (typeof window.showToast === 'function') {
            window.showToast('Maximum available quantity is ' + selectedStock);
          }
        }
      });
    }

    // ----------------------------------------------------
    // 6. Add to Cart with gentle shake & Mini Cart Drawer
    // ----------------------------------------------------
    function handleAddToCart() {
      if (!selectedSize) {
        // Scroll to size selector, gentle shake, and announce in aria-live
        if (sizeRow) {
          sizeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sizeRow.classList.remove('shake');
          void sizeRow.offsetWidth; // force reflow
          sizeRow.classList.add('shake');
          setTimeout(function () {
            sizeRow.classList.remove('shake');
          }, 450);
        }
        if (sizeWarning) {
          sizeWarning.textContent = isMl ? 'ദയവായി ഒരു സൈസ് തിരഞ്ഞെടുക്കുക.' : 'Please select a size.';
          sizeWarning.className = 'pdp-size-note pdp-size-note--err';
        }
        return;
      }

      if (window.CartStore) {
        window.CartStore.addItem(productId, selectedSize, quantity, selectedStock);
        if (typeof window.showToast === 'function') {
          window.showToast('Added ' + productName + ' (' + selectedSize + ') to bag ✓');
        }
        openMiniCartDrawer();
      }
    }

    if (addBtn) addBtn.addEventListener('click', handleAddToCart);
    if (mobileStickyAddBtn) mobileStickyAddBtn.addEventListener('click', handleAddToCart);

    // ----------------------------------------------------
    // 7. Size Guide Drawer & Calculator
    // ----------------------------------------------------
    function openSizeDrawer() {
      if (!sizeDrawer) return;
      sizeDrawer.hidden = false;
      if (drawerBackdrop) drawerBackdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      if (sizeDrawerCloseBtn) sizeDrawerCloseBtn.focus();
    }

    function closeSizeDrawer() {
      if (!sizeDrawer) return;
      sizeDrawer.hidden = true;
      if (drawerBackdrop && (!miniCartDrawer || miniCartDrawer.hidden)) {
        drawerBackdrop.hidden = true;
      }
      document.body.style.overflow = '';
      if (sizeDrawerOpenBtn) sizeDrawerOpenBtn.focus();
    }

    if (sizeDrawerOpenBtn) sizeDrawerOpenBtn.addEventListener('click', openSizeDrawer);
    if (sizeDrawerCloseBtn) sizeDrawerCloseBtn.addEventListener('click', closeSizeDrawer);

    // Side drawer bust calculator
    var drawerBustInput = document.getElementById('drawerBust');
    var drawerBustResult = document.getElementById('drawerBustResult');
    var SIZES_CHART = [
      ['M', 36],
      ['L', 38],
      ['XL', 40],
      ['XXL', 42],
      ['3XL', 44]
    ];
    if (drawerBustInput && drawerBustResult) {
      drawerBustInput.addEventListener('input', function () {
        var val = parseFloat(drawerBustInput.value);
        if (!val) {
          drawerBustResult.textContent = drawerBustResult.dataset.default || 'Enter your bust measurement in inches.';
          return;
        }
        if (val < 30 || val > 56) {
          drawerBustResult.textContent = 'Please enter a measurement between 30 and 56 inches.';
          return;
        }
        var rec = null;
        for (var i = 0; i < SIZES_CHART.length; i++) {
          if (val <= SIZES_CHART[i][1] + 1) {
            rec = SIZES_CHART[i][0];
            break;
          }
        }
        if (rec) {
          drawerBustResult.textContent = 'Recommended size: ' + rec + '. If you prefer a loose relaxed fit, select ' + (rec === '3XL' ? '3XL' : 'one size up') + '.';
        } else {
          drawerBustResult.textContent = 'Measurement is above 3XL. Message our WhatsApp for tailored assistance.';
        }
      });
    }

    // ----------------------------------------------------
    // 8. Mini Cart Drawer
    // ----------------------------------------------------
    function renderMiniCart() {
      if (!miniCartItemsList || !window.CartStore) return;
      miniCartItemsList.innerHTML = '';

      window.CartStore.validate(function (err, data) {
        var items = (data && data.items) || [];
        var subtotal = (data && data.subtotal) || 0;

        if (items.length === 0) {
          var emptyP = document.createElement('p');
          emptyP.className = 'mini-cart-empty';
          emptyP.textContent = isMl ? 'നിങ്ങളുടെ ഷോപ്പിംഗ് ബാഗ് ശൂന്യമാണ്.' : 'Your shopping bag is empty.';
          miniCartItemsList.appendChild(emptyP);
        } else {
          items.forEach(function (item) {
            var row = document.createElement('div');
            row.className = 'mini-cart-item';

            var img = document.createElement('img');
            img.className = 'mini-cart-thumb';
            img.src = item.image || '/img/placeholders/rose-garden-1.svg';
            img.alt = item.name;
            row.appendChild(img);

            var meta = document.createElement('div');
            meta.className = 'mini-cart-meta';

            var nameEl = document.createElement('h4');
            nameEl.className = 'mini-cart-name';
            nameEl.textContent = item.name;
            meta.appendChild(nameEl);

            var details = document.createElement('div');
            details.className = 'mini-cart-details';
            details.textContent = 'Size: ' + item.size + ' × ' + item.qty;
            meta.appendChild(details);

            var priceEl = document.createElement('div');
            priceEl.className = 'mini-cart-price';
            priceEl.textContent = '₹' + (item.lineTotal || (item.price * item.qty)).toLocaleString('en-IN');
            meta.appendChild(priceEl);

            row.appendChild(meta);

            var removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'mini-cart-remove';
            removeBtn.setAttribute('aria-label', 'Remove ' + item.name);
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function () {
              window.CartStore.removeItem(item.productId, item.size);
              renderMiniCart();
            });
            row.appendChild(removeBtn);

            miniCartItemsList.appendChild(row);
          });
        }

        if (miniCartSubtotal) {
          miniCartSubtotal.textContent = '₹' + subtotal.toLocaleString('en-IN');
        }
      });
    }

    function openMiniCartDrawer() {
      if (!miniCartDrawer) return;
      renderMiniCart();
      miniCartDrawer.hidden = false;
      if (drawerBackdrop) drawerBackdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      if (miniCartCloseBtn) miniCartCloseBtn.focus();
    }

    function closeMiniCartDrawer() {
      if (!miniCartDrawer) return;
      miniCartDrawer.hidden = true;
      if (drawerBackdrop && (!sizeDrawer || sizeDrawer.hidden)) {
        drawerBackdrop.hidden = true;
      }
      document.body.style.overflow = '';
      if (addBtn) addBtn.focus();
    }

    if (miniCartCloseBtn) miniCartCloseBtn.addEventListener('click', closeMiniCartDrawer);

    // Listen to global open drawer event from Quick Add
    window.addEventListener('cart:item-added', function () {
      openMiniCartDrawer();
    });

    // Backdrop click closes any open drawer
    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', function () {
        closeSizeDrawer();
        closeMiniCartDrawer();
      });
    }

    // ----------------------------------------------------
    // 9. Mobile Sticky Bottom Bar (IntersectionObserver)
    // ----------------------------------------------------
    if (mobileStickyBar && addBtn && 'IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          // If main Add to Cart is visible, hide mobile sticky bar
          if (entry.isIntersecting) {
            mobileStickyBar.hidden = true;
            mobileStickyBar.setAttribute('aria-hidden', 'true');
          } else {
            // Only show on mobile / tablet width <= 768px
            if (window.innerWidth <= 768) {
              mobileStickyBar.hidden = false;
              mobileStickyBar.setAttribute('aria-hidden', 'false');
            }
          }
        });
      }, { threshold: 0.1 });

      obs.observe(addBtn);

      window.addEventListener('resize', function () {
        if (window.innerWidth > 768) {
          mobileStickyBar.hidden = true;
          mobileStickyBar.setAttribute('aria-hidden', 'true');
        }
      });
    }

    // ----------------------------------------------------
    // 10. Global Keydown Handlers (Escape closes open overlays)
    // ----------------------------------------------------
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (lightbox && !lightbox.hidden) {
          closeLightbox();
        } else if (sizeDrawer && !sizeDrawer.hidden) {
          closeSizeDrawer();
        } else if (miniCartDrawer && !miniCartDrawer.hidden) {
          closeMiniCartDrawer();
        }
      } else if (lightbox && !lightbox.hidden) {
        if (e.key === 'ArrowRight') {
          lightboxIdx = (lightboxIdx + 1) % imageSlides.length;
          updateLightboxImage();
        } else if (e.key === 'ArrowLeft') {
          lightboxIdx = (lightboxIdx - 1 + imageSlides.length) % imageSlides.length;
          updateLightboxImage();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPDP);
  } else {
    initPDP();
  }
})();

