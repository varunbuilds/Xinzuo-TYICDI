/**
 * Judge.me Review Card Enhancer — xinzuo.com.au
 * Injects product thumbnail images into review cards on the all-reviews page.
 * Uses Shopify AJAX API to fetch product images by handle.
 */
(function () {
  var cache = {};
  var pending = {};

  function getProductImage(handle) {
    if (cache[handle]) return Promise.resolve(cache[handle]);
    if (pending[handle]) return pending[handle];

    pending[handle] = fetch('/products/' + handle + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var img = data.product && data.product.featured_image
          ? data.product.featured_image
          : (data.product && data.product.images && data.product.images[0])
            ? data.product.images[0]
            : null;
        if (img && typeof img === 'object') img = img.src;
        // Request a small size from Shopify CDN
        if (img) img = img.replace(/\.([a-z]+)(\?|$)/, '_180x180_crop_center.$1$2');
        cache[handle] = img;
        delete pending[handle];
        return img;
      })
      .catch(function () {
        cache[handle] = null;
        delete pending[handle];
        return null;
      });

    return pending[handle];
  }

  function enhanceReview(rev) {
    if (rev.dataset.thumbEnhanced) return;
    rev.dataset.thumbEnhanced = '1';

    var link = rev.querySelector('a.jdgm-rev__prod-link');
    if (!link || !link.href) return;

    var match = link.getAttribute('href').match(/\/products\/([^#?/]+)/);
    if (!match) return;

    var handle = match[1];
    getProductImage(handle).then(function (src) {
      if (!src) return;
      var img = document.createElement('img');
      img.className = 'jdgm-rev__product-thumb';
      img.src = src;
      img.alt = (link.textContent || '').trim();
      img.width = 80;
      img.height = 80;
      img.loading = 'lazy';
      img.onerror = function () { img.remove(); rev.classList.remove('has-product-thumb'); };
      rev.prepend(img);
      rev.classList.add('has-product-thumb');
    });
  }

  function enhanceAll() {
    var revs = document.querySelectorAll('.jdgm-rev:not([data-thumb-enhanced])');
    revs.forEach(enhanceReview);
  }

  // Run once DOM-ready reviews exist, then watch for Load More additions
  var observer = new MutationObserver(function (mutations) {
    var hasNew = false;
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length) { hasNew = true; break; }
    }
    if (hasNew) { enhanceAll(); customizeAllForms(); }
  });

  // Customize the "Write a Review" form name format dropdown:
  // Default to "John S." and hide the Anonymous option
  function customizeNameFormat(form) {
    if (form.dataset.nameFormatCustomized) return;
    var sel = form.querySelector('select[name="reviewer_name_format"]');
    if (!sel) return;
    form.dataset.nameFormatCustomized = '1';
    // Set default to "John S." (last_initial)
    sel.value = 'last_initial';
    // Remove the Anonymous option entirely
    for (var i = sel.options.length - 1; i >= 0; i--) {
      if (sel.options[i].value === 'anonymous') {
        sel.remove(i);
        break;
      }
    }
    // Remove "How we use your data" privacy paragraph
    var paragraphs = form.querySelectorAll('.jdgm-form__fieldset p');
    paragraphs.forEach(function (p) {
      if (p.textContent.indexOf('How we use your data') !== -1) {
        p.parentElement.style.display = 'none';
      }
    });
  }

  function customizeAllForms() {
    var forms = document.querySelectorAll('.jdgm-form');
    forms.forEach(customizeNameFormat);
  }

  // Start observing as soon as possible
  function init() {
    enhanceAll();
    customizeAllForms();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
