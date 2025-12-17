// --- Cart Modal UI Logic ---

import { getCartItems, getCartTotalValue, removeFromCart, clearCart, updateCartDisplay, decreaseCartItemQuantity, addToCart, getCartCurrency } from './cart.js'; 
import { showCheckoutModal } from './checkout.js'; 
import { formatPriceForDisplay } from './ui.js'; 

let cartModal = null;
let cartButton = null;
let closeButton = null;
let itemsList = null;
let totalPriceElement = null;
let totalPriceLabelElement = null; 
let emptyMessageElement = null; 
let clearCartButton = null;
let checkoutButton = null;

// --- Helper Functions ---

/**
 * Formats a number as currency using the UI helper.
 * @param {number} amount
 * @param {string} currency - 'CUP' or 'MLC'
 * @returns {string} Formatted currency string.
 */
function formatCurrency(amount, currency) {
    const numericAmount = typeof amount === 'number' ? amount : 0;
    return formatPriceForDisplay(numericAmount, currency);
}

// --- Core UI Functions ---

/**
 * Renders the items currently in the cart into the modal list.
 * Updates the total price display, including the cart's current currency.
 */
function renderCartItems() {
    if (!itemsList || !totalPriceElement || !totalPriceLabelElement) { 
        console.error("Cart modal elements (list, total value, or total label) not found for rendering.");
        return;
    }
    
    const emptyMessageTemplate = document.getElementById('cart-empty-message-template'); 

    const items = getCartItems();
    const totalValue = getCartTotalValue();
    const currentCartCurrency = getCartCurrency(); 

    itemsList.innerHTML = '';

    if (items.length === 0) {
        if (emptyMessageTemplate) {
            const emptyMsgClone = emptyMessageTemplate.content.cloneNode(true);
            itemsList.appendChild(emptyMsgClone);
        } else {
            itemsList.innerHTML = '<p class="cart-empty-message">Tu cesta está vacía.</p>';
        }
        totalPriceLabelElement.textContent = 'Total:';
    } else {
        const currentEmptyMsg = itemsList.querySelector('.cart-empty-message');
        currentEmptyMsg?.remove();

        totalPriceLabelElement.textContent = `Total (${currentCartCurrency || '??'}):`; 

        items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item';
            itemElement.dataset.productId = item.id;
            const displayCurrency = currentCartCurrency || 'CUP'; 

            itemElement.innerHTML = `
                <div class="cart-item-details">
                    <span class="item-name">${item.name || 'Nombre no disponible'}</span>
                     <span class="item-price-per-unit">${formatCurrency(item.price, displayCurrency)} / ud.</span>
                </div>
                <div class="cart-item-quantity">x ${item.quantity}</div>
                <div class="cart-item-price">${formatCurrency(item.price * item.quantity, displayCurrency)}</div>
                <button class="cart-item-remove" aria-label="Eliminar ${item.name || 'producto'}">&times;</button>
            `;

            const removeBtn = itemElement.querySelector('.cart-item-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    console.log(`Requesting removal of item ID: ${item.id}`);
                    removeFromCart(item.id); 
                });
            }

            itemsList.appendChild(itemElement);
        });
    }

    const displayCurrencyForTotal = currentCartCurrency || 'CUP'; 
    totalPriceElement.textContent = formatCurrency(totalValue, displayCurrencyForTotal);

    if (checkoutButton) {
        checkoutButton.disabled = items.length === 0;
    }
}

/**
 * Shows the cart modal.
 */
function displayCartModal() {
    if (!cartModal) return;
    console.log("Displaying cart modal");
    renderCartItems(); 
    cartModal.classList.remove('modal-hidden');
    cartModal.classList.add('modal-visible');
    closeButton?.focus();
}

/**
 * Hides the cart modal.
 */
function hideCartModal() {
    if (!cartModal) return;
    console.log("Hiding cart modal");
    cartModal.classList.remove('modal-visible');
    const handler = () => {
        if (!cartModal.classList.contains('modal-visible')) {
             cartModal.classList.add('modal-hidden');
        }
    };
    cartModal.addEventListener('transitionend', handler, { once: true }); 

    setTimeout(() => {
         if (!cartModal.classList.contains('modal-visible')) {
            cartModal.classList.add('modal-hidden');
         }
         cartModal.removeEventListener('transitionend', handler);
    }, 350); 
}

/**
 * Renders cart items only if the modal is currently visible.
 * This is exposed globally to be called from cart.js when cart data changes.
 */
window.renderCartItemsIfVisible = () => {
    if (cartModal && cartModal.classList.contains('modal-visible')) {
        console.log("Cart modal is visible, re-rendering items...");
        renderCartItems();
    }
};

/**
 * Initializes the cart UI elements and event listeners.
 */
export function initializeCartUI() {
    cartModal = document.getElementById('cart-modal');
    cartButton = document.getElementById('cart-button');
    closeButton = document.getElementById('cart-modal-close');
    itemsList = document.getElementById('cart-items-list');
    totalPriceElement = document.getElementById('cart-total-price');
    totalPriceLabelElement = document.querySelector('.cart-total strong');
    clearCartButton = document.getElementById('cart-clear-button');
    checkoutButton = document.getElementById('cart-checkout-button'); 

    if (!cartModal || !cartButton || !closeButton || !itemsList || !totalPriceElement || !totalPriceLabelElement || !clearCartButton || !checkoutButton) { 
        console.warn("One or more cart UI elements could not be found. Cart UI might not function correctly.");
        return;
    }

    if (cartButton) {
        cartButton.addEventListener('click', displayCartModal);
    }

    if (closeButton) {
        closeButton.addEventListener('click', hideCartModal);
    }

    if (cartModal) {
        cartModal.addEventListener('click', (event) => {
            if (event.target === cartModal) { 
                hideCartModal();
            }
        });
    }

    if (clearCartButton) {
        clearCartButton.addEventListener('click', () => {
            clearCart(); 
        });
    }

    if (checkoutButton) {
        checkoutButton.addEventListener('click', () => {
            hideCartModal();
            showCheckoutModal();
        });
    }

    console.log("Cart UI Initialized");
}