/**
 * Nest by Ammakkili - Home Hero Slideshow
 * Handles smooth crossfading, dots, hover/focus pause, and accessible play/pause control.
 */
(function () {
  'use strict';

  function initHeroSlider() {
    var slider = document.getElementById('heroSlider');
    if (!slider) return;

    var slides = slider.querySelectorAll('.hero-slide');
    if (!slides || slides.length <= 1) return;

    var dots = slider.querySelectorAll('.hero-dot');
    var pauseBtn = document.getElementById('heroPauseBtn');
    var count = slides.length;
    var currentIdx = 0;
    var timer = null;
    var isManualPaused = false;
    var isHoverPaused = false;
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function goToSlide(idx) {
      currentIdx = (idx + count) % count;

      slides.forEach(function (slide, i) {
        var active = i === currentIdx;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });

      dots.forEach(function (dot, i) {
        var active = i === currentIdx;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    function nextSlide() {
      goToSlide(currentIdx + 1);
    }

    function startTimer() {
      stopTimer();
      if (reducedMotion || isManualPaused || isHoverPaused) return;
      timer = setInterval(nextSlide, 6000);
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    // Dot clicks
    dots.forEach(function (dot, idx) {
      dot.addEventListener('click', function () {
        goToSlide(idx);
        startTimer();
      });
    });

    // Pause button toggle
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function () {
        isManualPaused = !isManualPaused;
        pauseBtn.setAttribute('aria-pressed', isManualPaused ? 'true' : 'false');
        var iconSpan = pauseBtn.querySelector('.hero-pause-icon');
        if (iconSpan) {
          iconSpan.textContent = isManualPaused ? '▶' : '⏸';
        }
        pauseBtn.title = isManualPaused ? 'Play slideshow' : 'Pause slideshow';
        pauseBtn.setAttribute('aria-label', isManualPaused ? 'Play slideshow' : 'Pause slideshow');

        if (isManualPaused) {
          stopTimer();
        } else {
          startTimer();
        }
      });
    }

    // Pause on hover
    slider.addEventListener('mouseenter', function () {
      isHoverPaused = true;
      stopTimer();
    });

    slider.addEventListener('mouseleave', function () {
      isHoverPaused = false;
      startTimer();
    });

    // Pause on focus
    slider.addEventListener('focusin', function () {
      isHoverPaused = true;
      stopTimer();
    });

    slider.addEventListener('focusout', function () {
      isHoverPaused = false;
      startTimer();
    });

    // Listen to prefers-reduced-motion dynamically
    if (window.matchMedia) {
      var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mql.addEventListener) {
        mql.addEventListener('change', function (e) {
          reducedMotion = e.matches;
          if (reducedMotion) {
            stopTimer();
          } else {
            startTimer();
          }
        });
      }
    }

    // Start slideshow if motion is not reduced
    if (!reducedMotion) {
      startTimer();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroSlider);
  } else {
    initHeroSlider();
  }
})();

