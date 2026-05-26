import { Component } from '@theme/component';
import { fetchConfig, resetShimmer } from '@theme/utilities';
import { morphSection, sectionRenderer } from '@theme/section-renderer';
import {
  ThemeEvents,
  CartUpdateEvent,
  QuantitySelectorUpdateEvent,
  CartAddEvent,
  DiscountUpdateEvent,
} from '@theme/events';
import { cartPerformance } from '@theme/performance';

/** @typedef {import('./utilities').TextComponent} TextComponent */

/**
 * A custom element that displays a cart items component.
 *
 * @typedef {object} Refs
 * @property {HTMLElement[]} quantitySelectors - The quantity selector elements.
 * @property {HTMLTableRowElement[]} cartItemRows - The cart item rows.
 * @property {TextComponent} cartTotal - The cart total.
 *
 * @extends {Component<Refs>}
 */
class CartItemsComponent extends Component {
  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.addEventListener(ThemeEvents.discountUpdate, this.handleDiscountUpdate);
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#onQuantityChange);
    this.addEventListener('click', this.#handleBundleRemoveClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.removeEventListener(ThemeEvents.quantitySelectorUpdate, this.#onQuantityChange);
    this.removeEventListener('click', this.#handleBundleRemoveClick);
  }

  /**
   * Handles QuantitySelectorUpdateEvent change event.
   * @param {QuantitySelectorUpdateEvent} event - The event.
   */
  #onQuantityChange = (event) => {
    const { quantity, cartLine: line } = event.detail;

    if (!line) return;

    if (quantity === 0) {
      return this.onLineItemRemove(line);
    }

    this.updateQuantity({
      line,
      quantity,
      action: 'change',
    });
    const lineItemRow = this.refs.cartItemRows[line - 1];

    if (!lineItemRow) return;

    const textComponent = /** @type {TextComponent | undefined} */ (lineItemRow.querySelector('text-component'));
    textComponent?.shimmer();
  };

  /**
   * Handles the line item removal.
   * @param {number} line - The line item index.
   */
  onLineItemRemove(line) {
    const isLastVisibleLine = this.refs.cartItemRows?.length === 1;
    if (isLastVisibleLine) {
      this.#syncCartDrawerEmptyState(true);
    }

    // Wait for section morph after API — optimistic row removal left stale footer/totals.
    return this.updateQuantity({
      line,
      quantity: 0,
      action: 'clear',
    });
  }

  /**
   * Handles click on "Remove Bundle" button.
   * @param {Event} event
   */
  #handleBundleRemoveClick = (event) => {
    const removeBtn = event.target.closest('.cart-bundle-remove-all');
    if (!removeBtn) return;

    event.preventDefault();

    const bundleKeys = removeBtn.dataset.bundleKeys;
    if (!bundleKeys) return;

    const keys = bundleKeys.split(',');
    this.#removeBundleItems(keys, removeBtn);
  };

  /**
   * Removes all bundle items by their keys in a single API call.
   * @param {string[]} keys - Array of cart item keys to remove.
   * @param {HTMLElement} triggerBtn - The button that triggered the removal.
   */
  async #removeBundleItems(keys, triggerBtn) {
    this.#disableCartItems();

    const updates = {};
    keys.forEach((key) => {
      updates[key] = 0;
    });

    // Animate out the bundle header and all bundle item rows
    const sectionsParam = this.#getSectionsParam();

    try {
      const response = await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates,
          sections: sectionsParam,
          sections_url: window.location.pathname,
        }),
      });

      let parsedResponse = await response.json();

      // Clean up non-applicable discount codes (e.g., bundle discount no longer qualifying)
      const nonApplicableCodes = (parsedResponse.discount_codes || [])
        .filter((d) => !d.applicable)
        .map((d) => d.code);

      if (nonApplicableCodes.length > 0) {
        const applicableCodes = (parsedResponse.discount_codes || [])
          .filter((d) => d.applicable)
          .map((d) => d.code);

        const cleanupResponse = await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            discount: applicableCodes.join(','),
            sections: sectionsParam,
            sections_url: window.location.pathname,
          }),
        });
        parsedResponse = await cleanupResponse.json();
      }

      this.#applyCartSectionUpdate(parsedResponse);
    } catch (error) {
      console.error('Error removing bundle:', error);
    } finally {
      this.#enableCartItems();
    }
  }

  /**
   * Updates the quantity.
   * @param {Object} config - The config.
   * @param {number} config.line - The line.
   * @param {number} config.quantity - The quantity.
   * @param {string} config.action - The action.
   */
  async updateQuantity(config) {
    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker(`${config.action}:user-action`);

    this.#disableCartItems();

    const { line, quantity } = config;
    const { cartTotal } = this.refs;
    const sectionsParam = this.#getSectionsParam();

    cartTotal?.shimmer();

    try {
      const combinedUpdates = this.#buildCartUpdatesForLine(line, quantity);

      if (combinedUpdates) {
        const response = await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: combinedUpdates,
            sections: sectionsParam,
            sections_url: window.location.pathname,
          }),
        });

        const parsedResponse = await response.json();
        resetShimmer(this);

        if (parsedResponse.errors) {
          this.#handleCartError(line, parsedResponse);
          return;
        }

        this.#applyCartSectionUpdate(parsedResponse);
        return;
      }

      const body = JSON.stringify({
        line,
        quantity,
        sections: sectionsParam,
        sections_url: window.location.pathname,
      });

      const response = await fetch(`${Theme.routes.cart_change_url}`, fetchConfig('json', { body }));
      const parsedResponseText = JSON.parse(await response.text());

      resetShimmer(this);

      if (parsedResponseText.errors) {
        this.#handleCartError(line, parsedResponseText);
        return;
      }

      await this.#updateEngravingFeeIfNeeded(parsedResponseText, line, quantity, this.#getSectionsToUpdateSet());

      this.#applyCartSectionUpdate(parsedResponseText);
    } catch (error) {
      console.error(error);
    } finally {
      this.#enableCartItems();
      cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
    }
  }

  /**
   * @returns {Set<string>}
   */
  #getSectionsToUpdateSet() {
    const sectionsToUpdate = new Set([this.sectionId]);
    document.querySelectorAll('cart-items-component').forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    });
    return sectionsToUpdate;
  }

  /**
   * @returns {string}
   */
  #getSectionsParam() {
    return Array.from(this.#getSectionsToUpdateSet()).join(',');
  }

  /**
   * One /cart/update.js request: line item key + engraving fee variant qty (avoids a second round-trip).
   * @param {number} line
   * @param {number} quantity
   * @returns {Record<string, number> | null}
   */
  #buildCartUpdatesForLine(line, quantity) {
    const row = this.refs.cartItemRows[line - 1];
    const lineKey = row?.dataset?.key;
    if (!lineKey) return null;

    /** @type {Record<string, number>} */
    const updates = { [lineKey]: quantity };

    const feeIds = this.#getEngravingFeeVariantIds();
    if (feeIds.oneLine || feeIds.twoLine) {
      const required = this.#computeRequiredEngravingFees(line, quantity);
      if (feeIds.oneLine) updates[feeIds.oneLine] = required.oneLine;
      if (feeIds.twoLine) updates[feeIds.twoLine] = required.twoLine;
    }

    return updates;
  }

  /**
   * @returns {{ oneLine: number | null, twoLine: number | null, productId: number }}
   */
  #getEngravingFeeVariantIds() {
    if (typeof window.getXinzuoEngravingFeeVariantIds === 'function') {
      return window.getXinzuoEngravingFeeVariantIds();
    }
    return { oneLine: null, twoLine: null, productId: 0 };
  }

  /**
   * @param {number} changedLine
   * @param {number} newQuantity
   * @returns {{ oneLine: number, twoLine: number }}
   */
  #computeRequiredEngravingFees(changedLine, newQuantity) {
    let requiredOneLine = 0;
    let requiredTwoLine = 0;

    this.refs.cartItemRows.forEach((cartRow, index) => {
      if (cartRow.dataset.hasEngraving !== 'true') return;

      const cartLine = index + 1;
      const input = cartRow.querySelector('input[name="updates[]"]');
      let qty = parseInt(input?.value || '0', 10);
      if (cartLine === changedLine) qty = newQuantity;

      if (qty <= 0) return;

      const knifeNum = parseInt(cartRow.dataset.knifeNum || '1', 10) || 1;
      const contribution = qty * knifeNum;

      if (cartRow.dataset.engravingTwoLine === 'true') {
        requiredTwoLine += contribution;
      } else {
        requiredOneLine += contribution;
      }
    });

    return { oneLine: requiredOneLine, twoLine: requiredTwoLine };
  }

  /**
   * Updates engraving fee quantities for both one-line and two-line fees.
   * Only makes an API call if fee adjustment is needed.
   * @param {Object} cartResponse - The cart response from the main update.
   * @param {number} originalLine - The original line that was updated.
   * @param {number} newQuantity - The new quantity of the main item.
   * @param {Set<string>} sectionsToUpdate - Sections to include in the update.
   */
  async #updateEngravingFeeIfNeeded(cartResponse, originalLine, newQuantity, sectionsToUpdate) {
    const items = cartResponse.items;
    if (!items) return;

    const feeIds = typeof window.getXinzuoEngravingFeeVariantIds === 'function'
      ? window.getXinzuoEngravingFeeVariantIds()
      : { oneLine: null, twoLine: null };
    const FEE_ONE_LINE = feeIds.oneLine;
    const FEE_TWO_LINES = feeIds.twoLine;
    if (!FEE_ONE_LINE && !FEE_TWO_LINES) return;

    // Calculate required quantities for BOTH fee types
    let requiredOneLine = 0;
    let requiredTwoLine = 0;

    items.forEach(item => {
      if (item.properties && item.properties["Engraving Text"]) {
        const knifeQty = parseInt(item.properties["Knife Quantity"]) || 1;
        const qty = item.quantity * knifeQty;
        
        if (item.properties["Engraving Text2"]) {
          requiredTwoLine += qty;
        } else {
          requiredOneLine += qty;
        }
      }
    });

    // Find current fee items
    const feeOneItem = FEE_ONE_LINE ? items.find(i => i.variant_id === FEE_ONE_LINE) : undefined;
    const feeTwoItem = FEE_TWO_LINES ? items.find(i => i.variant_id === FEE_TWO_LINES) : undefined;

    const currentOneLine = feeOneItem?.quantity || 0;
    const currentTwoLine = feeTwoItem?.quantity || 0;

    // Build updates object for any fees that need adjustment
    const updates = {};
    if (FEE_ONE_LINE && currentOneLine !== requiredOneLine) {
      updates[FEE_ONE_LINE] = requiredOneLine;
    }
    if (FEE_TWO_LINES && currentTwoLine !== requiredTwoLine) {
      updates[FEE_TWO_LINES] = requiredTwoLine;
    }

    // Only make API call if updates are needed
    if (Object.keys(updates).length === 0) return;

    // Use /cart/update.js to update both fee types in a single request
    const feeUpdateResponse = await fetch("/cart/update.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates,
        sections: Array.from(sectionsToUpdate).join(','),
        sections_url: window.location.pathname,
      })
    });

    // Update the sections in the original response with the new sections
    const feeUpdateData = await feeUpdateResponse.json();
    if (feeUpdateData.sections) {
      Object.assign(cartResponse.sections, feeUpdateData.sections);
      cartResponse.items = feeUpdateData.items;
      cartResponse.item_count = feeUpdateData.item_count;
    }
  }

  /**
   * Morph cart section HTML, sync drawer empty state, and broadcast cart update.
   * @param {{ sections?: Record<string, string>, item_count?: number }} cartResponse
   */
  #applyCartSectionUpdate(cartResponse) {
    const sectionHtml = cartResponse.sections?.[this.sectionId];
    if (!sectionHtml) return;

    let itemCount = typeof cartResponse.item_count === 'number' ? cartResponse.item_count : null;
    if (itemCount === null) {
      const parsed = new DOMParser().parseFromString(sectionHtml, 'text/html');
      const countText = parsed.querySelector('[ref="cartItemCount"]')?.textContent;
      itemCount = countText ? parseInt(countText, 10) : 0;
    }

    this.#syncCartDrawerEmptyState(itemCount === 0);

    this.dispatchEvent(
      new CartUpdateEvent({}, this.sectionId, {
        itemCount,
        source: 'cart-items-component',
        sections: cartResponse.sections,
      })
    );

    morphSection(this.sectionId, sectionHtml);
  }

  /**
   * Toggles cart-drawer--empty on the drawer dialog (class is only set server-side otherwise).
   * @param {boolean} isEmpty
   */
  #syncCartDrawerEmptyState(isEmpty) {
    const dialog = this.closest('cart-drawer-component')?.querySelector('.cart-drawer__dialog');
    dialog?.classList.toggle('cart-drawer--empty', isEmpty);
  }

  /**
   * Handles the discount update.
   * @param {DiscountUpdateEvent} event - The event.
   */
  handleDiscountUpdate = (event) => {
    this.#handleCartUpdate(event);
  };

  /**
   * Handles the cart error.
   * @param {number} line - The line.
   * @param {Object} parsedResponseText - The parsed response text.
   * @param {string} parsedResponseText.errors - The errors.
   */
  #handleCartError = (line, parsedResponseText) => {
    const quantitySelector = this.refs.quantitySelectors[line - 1];
    const quantityInput = quantitySelector?.querySelector('input');

    if (!quantityInput) throw new Error('Quantity input not found');

    quantityInput.value = quantityInput.defaultValue;

    const cartItemError = this.refs[`cartItemError-${line}`];
    const cartItemErrorContainer = this.refs[`cartItemErrorContainer-${line}`];

    if (!(cartItemError instanceof HTMLElement)) throw new Error('Cart item error not found');
    if (!(cartItemErrorContainer instanceof HTMLElement)) throw new Error('Cart item error container not found');

    cartItemError.textContent = parsedResponseText.errors;
    cartItemErrorContainer.classList.remove('hidden');
  };

  /**
   * Handles the cart update.
   *
   * @param {DiscountUpdateEvent | CartUpdateEvent | CartAddEvent} event
   */
  #handleCartUpdate = (event) => {
    if (event instanceof DiscountUpdateEvent) {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
      return;
    }
    if (event.target === this) return;

    const cartItemsHtml = event.detail.data.sections?.[this.sectionId];
    const itemCount = event.detail.data?.itemCount;

    if (typeof itemCount === 'number') {
      this.#syncCartDrawerEmptyState(itemCount === 0);
    }

    if (cartItemsHtml) {
      morphSection(this.sectionId, cartItemsHtml);
    } else {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    }
  };

  /**
   * Disables the cart items.
   */
  #disableCartItems() {
    this.classList.add('cart-items-disabled');
  }

  /**
   * Enables the cart items.
   */
  #enableCartItems() {
    this.classList.remove('cart-items-disabled');
  }

  /**
   * Gets the section id.
   * @returns {string} The section id.
   */
  get sectionId() {
    const { sectionId } = this.dataset;

    if (!sectionId) throw new Error('Section id missing');

    return sectionId;
  }
}

if (!customElements.get('cart-items-component')) {
  customElements.define('cart-items-component', CartItemsComponent);
}
