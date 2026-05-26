import { DialogComponent } from '@theme/dialog';
import { CartAddEvent, ThemeEvents } from '@theme/events';

/**
 * A custom element that manages a cart drawer.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
  }

  /**
   * Keep empty-drawer layout in sync when cart is updated via AJAX.
   * @param {CustomEvent} event
   */
  #handleCartUpdate = (event) => {
    const itemCount = event.detail?.data?.itemCount;
    if (itemCount === undefined) return;

    this.refs.dialog?.classList.toggle('cart-drawer--empty', itemCount === 0);
  };

  #handleCartAdd = () => {
    if (this.hasAttribute('auto-open')) {
      this.showDialog();
    }
  };

  open() {
    this.showDialog();

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}
