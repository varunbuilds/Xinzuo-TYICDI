import { Component } from '@theme/component';
import { CartAddEvent } from '@theme/events';

class BundleBuilderComponent extends Component {
  /** @type {Set<string>} Set of selected product IDs */
  #selectedProductIds = new Set();

  /** @type {Map<string, {variantId: string, price: number, comparePrice: number, title: string, image: string}>} */
  #productData = new Map();

  /** @type {Array<{minItems: number, discountPercent: number, label: string}>} */
  #tiers = [];

  #minItems = 3;
  #maxItems = 8;
  #isAddingToCart = false;

  /** @type {string} Currently active series filter handle ('all' = show all) */
  #activeTab = 'all';

  connectedCallback() {
    super.connectedCallback();
    this.#parseConfig();
    this.#parseProductData();
    this.#updateUI();
    this.#initTabArrows();
  }

  // --- Configuration ---

  #parseConfig() {
    this.#minItems = parseInt(this.dataset.minItems) || 3;
    this.#maxItems = parseInt(this.dataset.maxItems) || 8;
    try {
      this.#tiers = JSON.parse(this.dataset.tiers || '[]');
      this.#tiers.sort((a, b) => a.minItems - b.minItems);
    } catch {
      this.#tiers = [];
    }
  }

  #parseProductData() {
    const cards = this.refs.cards || [];
    for (const card of cards) {
      const productId = card.dataset.productId;
      this.#productData.set(productId, {
        variantId: card.dataset.variantId,
        price: parseInt(card.dataset.price) || 0,
        comparePrice: parseInt(card.dataset.comparePrice) || 0,
        title: card.dataset.title || '',
        image: card.dataset.image || '',
      });
    }
  }

  // --- Event Handlers ---

  handleCardClick(event) {
    const card = event.target.closest('.bundle-card');
    if (!card) return;
    if (card.dataset.available === 'false') return;

    event.preventDefault();
    event.stopPropagation();

    const productId = card.dataset.productId;

    if (this.#selectedProductIds.has(productId)) {
      this.#selectedProductIds.delete(productId);
      card.classList.remove('bundle-card--selected');
      card.setAttribute('aria-pressed', 'false');
    } else {
      if (this.#selectedProductIds.size >= this.#maxItems) {
        this.#shakeButton();
        return;
      }
      this.#selectedProductIds.add(productId);
      card.classList.add('bundle-card--selected');
      card.setAttribute('aria-pressed', 'true');
    }

    // Micro-interaction: brief scale pulse for tactile feedback
    card.style.transform = 'scale(0.97)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.transform = '';
      });
    });

    this.#updateUI();
  }

  async handleAddToCart() {
    if (this.#isAddingToCart) return;
    if (this.#selectedProductIds.size < this.#minItems) return;

    this.#isAddingToCart = true;
    const btn = this.refs.addToCartBtn;
    const originalText = btn.textContent;
    btn.textContent = 'Adding...';
    btn.disabled = true;

    try {
      const bundleId = `bundle_${Date.now()}`;
      const bundleCount = this.#selectedProductIds.size;

      // Determine the discount percent and code for this bundle size
      let discountPercent = 0;
      let discountCode = '';
      for (const tier of this.#tiers) {
        if (bundleCount >= tier.minItems) {
          discountPercent = tier.discountPercent;
          discountCode = tier.discountCode || '';
        }
      }

      const items = [];
      for (const productId of this.#selectedProductIds) {
        const data = this.#productData.get(productId);
        if (!data) continue;
        items.push({
          id: parseInt(data.variantId),
          quantity: 1,
          properties: {
            '_bundle_id': bundleId,
            '_bundle_count': String(bundleCount),
            '_bundle_source': 'bundle-builder',
            '_bundle_discount_percent': String(discountPercent),
            '_bundle_discount_code': discountCode,
          },
        });
      }

      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      // Open cart drawer so the customer can review their bundle
      // before deciding to checkout. The discount code will be applied
      // at checkout via the cart drawer's checkout button.
      let cart = await fetch('/cart.js').then((r) => r.json());

      document.dispatchEvent(
        new CartAddEvent({}, this.dataset.sectionId, {
          source: 'bundle-builder',
          itemCount: cart.item_count,
          productId: '',
          sections: [],
        })
      );

      btn.textContent = 'Added to Cart!';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        this.#isAddingToCart = false;
      }, 2500);
    } catch (error) {
      console.error('Bundle add to cart error:', error);
      btn.textContent = 'Error - Try Again';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        this.#isAddingToCart = false;
      }, 2000);
    }
  }



  handleTabClick(seriesHandle, event) {
    this.#activeTab = seriesHandle;
    this.#updateTabActiveStates();
    this.#filterCards();
    this.#scrollActiveTabIntoView();
  }

  handleTabArrow(direction) {
    const container = this.refs.tabsContainer;
    if (!container) return;
    const scrollAmount = container.offsetWidth * 0.65;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }

  // --- Tab Scroll ---

  #initTabArrows() {
    const container = this.refs.tabsContainer;
    if (!container) return;

    container.addEventListener('scroll', () => this.#updateScrollIndicators(), { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.#updateScrollIndicators()).observe(container);
    }

    this.#updateScrollIndicators();
  }

  #updateScrollIndicators() {
    const container = this.refs.tabsContainer;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const canScrollLeft = scrollLeft > 2;
    const canScrollRight = scrollLeft + clientWidth < scrollWidth - 2;

    // Fade masks
    if (this.refs.tabFadeLeft) {
      this.refs.tabFadeLeft.classList.toggle('bundle-tabs__fade--visible', canScrollLeft);
    }
    if (this.refs.tabFadeRight) {
      this.refs.tabFadeRight.classList.toggle('bundle-tabs__fade--visible', canScrollRight);
    }

    // Arrow buttons
    if (this.refs.tabArrowLeft) {
      this.refs.tabArrowLeft.classList.toggle('bundle-tabs__arrow--visible', canScrollLeft);
    }
    if (this.refs.tabArrowRight) {
      this.refs.tabArrowRight.classList.toggle('bundle-tabs__arrow--visible', canScrollRight);
    }
  }

  #scrollActiveTabIntoView() {
    const tabs = this.refs.tabs || [];
    const container = this.refs.tabsContainer;
    if (!container) return;

    const activeTab = tabs.find((t) => t.dataset.series === this.#activeTab);
    if (!activeTab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    const padInline = 40;

    if (tabRect.left < containerRect.left + padInline) {
      container.scrollBy({ left: tabRect.left - containerRect.left - padInline, behavior: 'smooth' });
    } else if (tabRect.right > containerRect.right - padInline) {
      container.scrollBy({ left: tabRect.right - containerRect.right + padInline, behavior: 'smooth' });
    }
  }

  // --- Tab Filtering ---

  #updateTabActiveStates() {
    const tabs = this.refs.tabs || [];
    for (const tab of tabs) {
      const isActive = tab.dataset.series === this.#activeTab;
      tab.classList.toggle('bundle-tabs__tab--active', isActive);
      tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  #filterCards() {
    const cards = this.refs.cards || [];
    for (const card of cards) {
      if (this.#activeTab === 'all') {
        card.style.display = '';
        card.removeAttribute('hidden');
      } else {
        const seriesList = (card.dataset.series || '').split(' ');
        const matches = seriesList.includes(this.#activeTab);
        card.style.display = matches ? '' : 'none';
        if (matches) {
          card.removeAttribute('hidden');
        } else {
          card.setAttribute('hidden', '');
        }
      }
    }
  }

  #updateTabCounts() {
    const tabs = this.refs.tabs || [];
    for (const tab of tabs) {
      const series = tab.dataset.series;
      const countEl = tab.querySelector('[data-series-count]');
      if (!countEl) continue;

      let count = 0;
      if (series === 'all') {
        count = this.#selectedProductIds.size;
      } else {
        const cards = this.refs.cards || [];
        for (const card of cards) {
          const seriesList = (card.dataset.series || '').split(' ');
          if (seriesList.includes(series) && this.#selectedProductIds.has(card.dataset.productId)) {
            count++;
          }
        }
      }
      countEl.textContent = count > 0 ? `(${count})` : '';
    }
  }

  // --- UI Updates ---

  #updateUI() {
    const count = this.#selectedProductIds.size;
    const hasSelection = count > 0;

    // Show/hide summary bar
    const summaryBar = this.refs.summaryBar;
    if (summaryBar) {
      if (hasSelection) {
        summaryBar.classList.add('bundle-summary--visible');
      } else {
        summaryBar.classList.remove('bundle-summary--visible');
      }
    }

    // Update count text
    if (this.refs.countText) {
      this.refs.countText.textContent = `${count} of ${this.#maxItems} selected`;
    }

    // Update progress text in header
    if (this.refs.progressText) {
      if (count === 0) {
        this.refs.progressText.textContent = `Select at least ${this.#minItems} items to unlock your discount`;
        this.refs.progressText.classList.remove('bundle-builder__progress--complete');
      } else if (count < this.#minItems) {
        const remaining = this.#minItems - count;
        this.refs.progressText.textContent = `Select ${remaining} more item${remaining > 1 ? 's' : ''} to unlock your discount`;
        this.refs.progressText.classList.remove('bundle-builder__progress--complete');
      } else {
        this.refs.progressText.textContent = `${count} item${count > 1 ? 's' : ''} selected — discount applied at checkout!`;
        this.refs.progressText.classList.add('bundle-builder__progress--complete');
      }
    }

    // Update progress bar — fills to 100% at max discount tier
    if (this.refs.progressFill) {
      const lastTierMin = this.#tiers.length > 0
        ? this.#tiers[this.#tiers.length - 1].minItems
        : this.#maxItems;
      const percent = Math.min((count / lastTierMin) * 100, 100);
      this.refs.progressFill.style.width = `${percent}%`;

      // Color based on tier achievement
      const fill = this.refs.progressFill;
      fill.classList.remove('bundle-summary__progress-fill--tier-active', 'bundle-summary__progress-fill--complete');
      if (count >= lastTierMin) {
        fill.classList.add('bundle-summary__progress-fill--complete');
      } else if (this.#tiers.length > 0 && count >= this.#tiers[0].minItems) {
        fill.classList.add('bundle-summary__progress-fill--tier-active');
      }

      // Update tier markers
      const markers = this.refs.tierMarkers || [];
      for (const marker of markers) {
        const tierMin = parseInt(marker.dataset.tierMin) || 0;
        marker.classList.toggle('bundle-summary__tier-marker--reached', count >= tierMin);
      }
    }

    // Calculate totals and active tier
    this.#updateTotals(count);

    // Update thumbnails
    this.#updateThumbnails();

    // Enable/disable CTA
    if (this.refs.addToCartBtn) {
      this.refs.addToCartBtn.disabled = count < this.#minItems || this.#isAddingToCart;
    }

    // Update per-tab selected counts
    this.#updateTabCounts();
  }

  #updateTotals(count) {
    let totalPrice = 0;
    for (const productId of this.#selectedProductIds) {
      const data = this.#productData.get(productId);
      if (data) totalPrice += data.price;
    }

    // Find active and next tier
    let activeTier = null;
    let nextTier = null;
    for (let i = 0; i < this.#tiers.length; i++) {
      if (count >= this.#tiers[i].minItems) {
        activeTier = this.#tiers[i];
        nextTier = this.#tiers[i + 1] || null;
      }
    }
    if (!activeTier && this.#tiers.length > 0) {
      nextTier = this.#tiers[0];
    }

    // Display prices
    if (activeTier) {
      const savingsAmount = Math.round((totalPrice * activeTier.discountPercent) / 100);
      const discountedPrice = totalPrice - savingsAmount;

      // Show original price with strikethrough
      if (this.refs.originalPrice) {
        this.refs.originalPrice.textContent = this.#formatMoney(totalPrice);
        this.refs.originalPrice.hidden = false;
      }

      // Show discounted price in red
      if (this.refs.totalPrice) {
        this.refs.totalPrice.textContent = this.#formatMoney(discountedPrice);
        this.refs.totalPrice.classList.add('bundle-summary__total-price--discounted');
      }

      // Show savings text
      if (this.refs.totalSavings) {
        this.refs.totalSavings.textContent = `You save ${this.#formatMoney(savingsAmount)}`;
        this.refs.totalSavings.hidden = false;
      }
    } else {
      // No tier active — show normal price
      if (this.refs.originalPrice) {
        this.refs.originalPrice.hidden = true;
      }
      if (this.refs.totalPrice) {
        this.refs.totalPrice.textContent = this.#formatMoney(totalPrice);
        this.refs.totalPrice.classList.remove('bundle-summary__total-price--discounted');
      }
      if (this.refs.totalSavings) {
        this.refs.totalSavings.hidden = true;
      }
    }

    // Display tier label
    if (this.refs.tierLabel) {
      this.refs.tierLabel.textContent = activeTier ? activeTier.label : '';
    }

    // Display next tier hint
    if (this.refs.nextTierHint) {
      if (nextTier) {
        const needed = nextTier.minItems - count;
        this.refs.nextTierHint.textContent = `Add ${needed} more for ${nextTier.label}!`;
      } else if (activeTier) {
        this.refs.nextTierHint.textContent = 'Maximum discount unlocked!';
      } else {
        this.refs.nextTierHint.textContent = '';
      }
    }
  }

  #updateThumbnails() {
    const strip = this.refs.thumbnailStrip;
    if (!strip) return;

    strip.innerHTML = '';
    for (const productId of this.#selectedProductIds) {
      const data = this.#productData.get(productId);
      if (!data || !data.image) continue;

      const img = document.createElement('img');
      img.src = data.image;
      img.alt = data.title;
      img.className = 'bundle-summary__thumb';
      img.width = 40;
      img.height = 40;
      strip.appendChild(img);
    }
  }

  #formatMoney(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  #shakeButton() {
    const btn = this.refs.addToCartBtn;
    if (!btn) return;
    btn.classList.add('bundle-summary__cta--shake');
    setTimeout(() => btn.classList.remove('bundle-summary__cta--shake'), 500);
  }
}

if (!customElements.get('bundle-builder-component')) {
  customElements.define('bundle-builder-component', BundleBuilderComponent);
}
