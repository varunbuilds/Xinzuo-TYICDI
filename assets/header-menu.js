import { Component } from '@theme/component';
import { onDocumentLoaded } from '@theme/utilities';
import { MegaMenuHoverEvent } from '@theme/events';

/**
 * @typedef {object} HeaderMenuRefs
 * @property {HTMLElement} [overflowMenu] - The overflow menu (Horizon pattern).
 * @property {HTMLElement[]} [submenu] - Submenus on list items.
 */

/**
 * A custom element that manages a header menu.
 *
 * Xinzuo uses custom full-screen dropdowns (`openMenu` in header-menu.liquid) for
 * Series / Type / Accessories. This component registers `<header-menu>` for
 * header.js refs and keeps Horizon-compatible activate/deactivate hooks for any
 * overflow-menu markup still in the theme.
 *
 * @extends {Component<HeaderMenuRefs>}
 */
class HeaderMenu extends Component {
  connectedCallback() {
    super.connectedCallback();
    onDocumentLoaded(this.#preloadImages);
  }

  /** Preload images that are set to load lazily inside the header. */
  #preloadImages = () => {
    this.querySelectorAll('img[loading="lazy"]').forEach((image) => {
      image.removeAttribute('loading');
    });
  };

  /**
   * Declarative handler for Horizon overflow mega-menu items.
   * @param {PointerEvent | FocusEvent} event
   */
  activate = (event) => {
    this.dispatchEvent(new MegaMenuHoverEvent());

    if (!(event.target instanceof Element)) return;

    const item = findMenuItem(event.target);
    if (!item) return;

    item.setAttribute('aria-expanded', 'true');
  };

  /**
   * Declarative handler for Horizon overflow mega-menu items.
   * @param {PointerEvent | FocusEvent} _event
   */
  deactivate = (_event) => {
    this.querySelectorAll('[ref="menuitem"][aria-expanded="true"]').forEach((el) => {
      el.setAttribute('aria-expanded', 'false');
    });
  };
}

if (!customElements.get('header-menu')) {
  customElements.define('header-menu', HeaderMenu);
}

/**
 * Find the closest menu item.
 * @param {Element | null | undefined} element
 * @returns {HTMLElement | null}
 */
function findMenuItem(element) {
  if (!(element instanceof Element)) return null;

  if (element.matches('[slot="more"]')) {
    return findMenuItem(element.parentElement?.querySelector('[slot="overflow"]'));
  }

  const menuitem = element.querySelector('[ref="menuitem"]');
  return menuitem instanceof HTMLElement ? menuitem : null;
}

/**
 * Find the closest submenu.
 * @param {Element | null | undefined} element
 * @returns {HTMLElement | null}
 */
function findSubmenu(element) {
  const submenu = element?.parentElement?.querySelector('[ref="submenu[]"]');
  return submenu instanceof HTMLElement ? submenu : null;
}
