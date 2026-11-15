/**
 * Nest by Ammakkili - Shop Page Filtering & Pagination
 * Handles AJAX filter chips, sort dropdown, pushState URL updates, and Load More button.
 */
(function () {
  'use strict';

  function initShop() {
    var filterBar = document.getElementById('shopFilterBar');
    var grid = document.getElementById('shopGrid');
    var countEl = document.getElementById('shopCount');
    var loadMoreWrap = document.getElementById('shopLoadMoreWrap');
    var loadMoreBtn = document.getElementById('shopLoadMoreBtn');
    var sortSelect = document.getElementById('shopSortSelect');
    var searchInput = document.getElementById('shopSearchInput');
    var searchForm = document.getElementById('shopSearchForm');

    if (!filterBar || !grid) return;

    var currentStyle = filterBar.getAttribute('data-current-style') || '';
    var currentSort = sortSelect ? sortSelect.value : 'featured';
    var currentQuery = searchInput ? searchInput.value.trim() : '';
    var currentPage = 1;
    var totalPages = parseInt(grid.getAttribute('data-total-pages'), 10) || 1;
    var lang = document.documentElement.lang || 'en';

    function buildUrl(style, sort, q, page) {
      var params = new URLSearchParams();
      if (style && style.toLowerCase() !== 'all') params.set('style', style);
      if (sort && sort !== 'featured') params.set('sort', sort);
      if (q) params.set('q', q);
      if (page && page > 1) params.set('page', page);
      var qs = params.toString();
      return '/shop' + (qs ? '?' + qs : '');
    }

    function updateUrl(style, sort, q) {
      var url = buildUrl(style, sort, q, 1);
      if (window.location.pathname + window.location.search !== url) {
        window.history.pushState({ style: style, sort: sort, q: q }, '', url);
      }
    }

    function renderEmptyState() {
      grid.innerHTML = '';
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'shop-empty-state';

      var p = document.createElement('p');
      p.className = 'shop-empty-text';
      p.textContent = lang === 'ml' 
        ? 'നിങ്ങൾ തിരഞ്ഞെടുത്ത രീതിയിലുള്ള നൈറ്റികൾ ഇപ്പോൾ ലഭ്യമല്ല.'
        : 'No nighty designs found matching your selected filters.';
      emptyDiv.appendChild(p);

      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn small';
      clearBtn.textContent = lang === 'ml' ? 'ഫിൽട്ടറുകൾ നീക്കുക' : 'Clear filters';
      clearBtn.addEventListener('click', function () {
        applyFilters('', 'featured', '');
      });
      emptyDiv.appendChild(clearBtn);

      grid.appendChild(emptyDiv);

      if (loadMoreWrap) loadMoreWrap.hidden = true;
    }

    function updateCount(count) {
      if (!countEl) return;
      var num = count || 0;
      var text = '';
      if (lang === 'ml') {
        text = num + ' ഡിസൈനുകൾ';
      } else {
        text = num === 1 ? '1 design' : num + ' designs';
      }
      countEl.textContent = text;
    }

    function fetchProducts(style, sort, q, page, append, cb) {
      grid.style.opacity = '0.4';
      grid.style.transition = 'opacity 0.2s ease';

      var fetchUrl = buildUrl(style, sort, q, page);
      fetchUrl += (fetchUrl.indexOf('?') !== -1 ? '&' : '?') + 'ajax=1';

      fetch(fetchUrl, {
        headers: { 'Accept': 'application/json' }
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          grid.style.opacity = '1';
          currentPage = data.currentPage || 1;
          totalPages = data.totalPages || 1;

          if (!append) {
            grid.innerHTML = '';
          }

          if (data.products && data.products.length > 0) {
            data.products.forEach(function (p) {
              if (window.createProductCardElement) {
                var cardEl = window.createProductCardElement(p, lang);
                grid.appendChild(cardEl);
              }
            });
          } else if (!append) {
            renderEmptyState();
          }

          updateCount(data.totalCount);

          if (loadMoreWrap) {
            loadMoreWrap.hidden = !data.hasMore;
          }

          if (cb) cb(null, data);
        })
        .catch(function (err) {
          grid.style.opacity = '1';
          console.error('Error fetching shop products:', err);
          if (cb) cb(err);
        });
    }

    function applyFilters(style, sort, q) {
      currentStyle = style || '';
      currentSort = sort || 'featured';
      currentQuery = q || '';
      currentPage = 1;

      // Update chip UI
      var chips = filterBar.querySelectorAll('.shop-chip');
      chips.forEach(function (chip) {
        var chipVal = chip.getAttribute('data-style') || '';
        var isMatch = (!currentStyle && (!chipVal || chipVal.toLowerCase() === 'all')) ||
                      (currentStyle.toLowerCase() === chipVal.toLowerCase());
        chip.classList.toggle('is-active', isMatch);
        chip.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      // Update sort select
      if (sortSelect) {
        sortSelect.value = currentSort;
      }

      // Update search input
      if (searchInput) {
        searchInput.value = currentQuery;
      }

      updateUrl(currentStyle, currentSort, currentQuery);
      fetchProducts(currentStyle, currentSort, currentQuery, 1, false);
    }

    // Chip click delegation
    filterBar.addEventListener('click', function (e) {
      var chip = e.target.closest('.shop-chip');
      if (chip) {
        e.preventDefault();
        var style = chip.getAttribute('data-style') || '';
        applyFilters(style, currentSort, currentQuery);
      }
    });

    // Sort select change
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        applyFilters(currentStyle, sortSelect.value, currentQuery);
      });
    }

    // Search form submit
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = searchInput ? searchInput.value.trim() : '';
        applyFilters(currentStyle, currentSort, q);
      });
    }

    // Load More button click
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        var nextPage = currentPage + 1;
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = lang === 'ml' ? 'ലോഡ് ചെയ്യുന്നു...' : 'Loading...';

        fetchProducts(currentStyle, currentSort, currentQuery, nextPage, true, function () {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = lang === 'ml' ? 'കൂടുതൽ കാണുക' : 'Load more designs';
        });
      });
    }

    // Popstate (Back / Forward navigation)
    window.addEventListener('popstate', function () {
      var params = new URLSearchParams(window.location.search);
      var s = params.get('style') || '';
      var sort = params.get('sort') || 'featured';
      var q = params.get('q') || '';
      currentStyle = s;
      currentSort = sort;
      currentQuery = q;

      // Update chip UI
      var chips = filterBar.querySelectorAll('.shop-chip');
      chips.forEach(function (chip) {
        var chipVal = chip.getAttribute('data-style') || '';
        var isMatch = (!currentStyle && (!chipVal || chipVal.toLowerCase() === 'all')) ||
                      (currentStyle.toLowerCase() === chipVal.toLowerCase());
        chip.classList.toggle('is-active', isMatch);
        chip.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      if (sortSelect) sortSelect.value = currentSort;
      if (searchInput) searchInput.value = currentQuery;

      fetchProducts(currentStyle, currentSort, currentQuery, 1, false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShop);
  } else {
    initShop();
  }
})();

