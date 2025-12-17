// --- Shopping Cart Logic ---
import { getSelectedCurrency } from './ui.js'; // Import to check selected currency

const CART_STORAGE_KEY = 'shoppingCartItems';
let cartItems = []; // In-memory cache of cart items [{ id, name, price, quantity }, ...]
let cartCurrency = null; // Stores the currency ('CUP' or 'MLC') of the items currently in the cart, null if empty

/**
 * Gets the currency associated with the current cart items.
 * Returns null if the cart is empty.
 * @returns {string|null} 'CUP', 'MLC', or null.
 */
export function getCartCurrency() {
    // Infer currency from the first item if cartCurrency is null but cart is not empty (e.g., after page load)
    // This is a fallback, ideally cartCurrency is set correctly on add/load.
    if (cartCurrency === null && cartItems.length > 0) {
        console.warn("Cart currency was not set, inferring from first item or selected currency. This might occur after page reload.");
        // Attempt to determine currency based on the first item's price relative to product data?
        // This is complex. A simpler approach is to assume it matches the *currently selected* UI currency
        // if we have to infer it. Or better: properly set it on load if possible.
        // For now, let's stick to the logic where it's set on the first add.
        // If loaded from storage, it remains null until the next add confirms the currency.
        // Let's refine loadCart to try and set it.
    }
    return cartCurrency;
}

/**
 * Loads cart items from localStorage into the in-memory cartItems array.
 * Also attempts to set the cartCurrency based on loaded items.
 */
function loadCart() {
    const storedCart = localStorage.getItem(CART_STORAGE_KEY);
    let loadedItems = [];
    if (storedCart) {
        try {
            loadedItems = JSON.parse(storedCart);
            // Ensure all items have valid numeric quantities and prices
            loadedItems = loadedItems.map(item => ({
                ...item,
                quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
                price: typeof item.price === 'number' ? item.price : 0,
            })).filter(item => item.id != null); // Remove items without an ID

            cartItems = loadedItems; // Assign validated items

            // Attempt to set cartCurrency if cart is not empty
            if (cartItems.length > 0) {
                // Problem: Stored items don't have currency info.
                // We *must* assume the stored prices correspond to the currency
                // that was selected when they were added. We can't know for sure.
                // Safest bet: Assume it matches the *currently selected* currency in the UI.
                // This might be wrong if the user switched currency after adding items and then reloaded.
                const currentSelectedUI = getSelectedCurrency();
                cartCurrency = currentSelectedUI; // Make an assumption based on current UI state
                console.log(`Cart loaded with ${cartItems.length} items. Assuming currency: ${cartCurrency} (based on current UI setting).`);
            } else {
                cartItems = []; // Initialize empty if parsing resulted in empty/invalid
                cartCurrency = null; // Ensure currency is null for empty cart
                console.log("Cart loaded empty or after clearing invalid data.");
            }

        } catch (error) {
            console.error("Error loading cart from localStorage:", error);
            cartItems = []; // Reset cart on error
            cartCurrency = null; // Reset currency
            localStorage.removeItem(CART_STORAGE_KEY); // Clear potentially corrupted data
        }
    } else {
        cartItems = []; // Initialize empty if nothing stored
        cartCurrency = null; // Ensure currency is null
    }
    console.log("Cart loaded. Current state:", cartItems, "Currency:", cartCurrency);
}

/**
 * Saves the current in-memory cartItems array to localStorage.
 */
function saveCart() {
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
        // console.log("Cart saved to localStorage:", cartItems);
    } catch (error) {
        console.error("Error saving cart to localStorage:", error);
        // Handle potential storage full errors?
    }
}

/**
 * Gets a copy of the current cart items.
 * @returns {Array} A copy of the cartItems array.
 */
export function getCartItems() {
    return [...cartItems]; // Return a copy to prevent direct modification
}

/**
 * Calculates the total number of individual items in the cart.
 * @returns {number} The total quantity of all items.
 */
function getCartCount() {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
}

/**
 * Calculates the total value of all items in the cart.
 * @returns {number} The total price.
 */
export function getCartTotalValue() {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
}

/**
 * Updates the visual display of the cart (e.g., item count on the basket button).
 */
export function updateCartDisplay() {
    const countElement = document.querySelector('.floating-basket-button .cart-item-count');
    if (!countElement) {
        console.warn("Cart count display element not found.");
        return;
    }

    const totalCount = getCartCount();
    // console.log("Updating cart display count:", totalCount); // Reduced logging noise

    requestAnimationFrame(() => { // Update DOM efficiently
        if (totalCount > 0) {
            countElement.textContent = totalCount > 99 ? '99+' : totalCount.toString(); // Show count, max 99+
            countElement.style.display = 'flex'; // Use flex for centering
            // Trigger animation (optional)
            countElement.classList.add('updated');
            setTimeout(() => countElement.classList.remove('updated'), 300); // Remove class after animation
        } else {
            countElement.textContent = '0';
            countElement.style.display = 'none'; // Hide if empty
        }
    });
}

/**
 * Adds an item to the shopping cart or updates its quantity if it already exists.
 * Enforces that all items in the cart must use the same currency.
 * @param {string} productId - The unique ID of the product.
 * @param {string} name - The name of the product.
 * @param {number} price - The price of one unit of the product (in the currently selected currency).
 * @param {number} quantity - The quantity to add.
 */
export function addToCart(productId, name, price, quantity) {
    if (!productId || !name || typeof price !== 'number' || typeof quantity !== 'number' || quantity <= 0) {
        console.error("Invalid item data provided to addToCart:", { productId, name, price, quantity });
        alert("Error: No se pudieron añadir los datos del artículo al carrito."); // User feedback
        return;
    }

    const selectedCurrency = getSelectedCurrency(); // Currency selected in the UI

    // --- Currency Check ---
    if (cartItems.length === 0) {
        // Cart is empty, this item sets the currency
        cartCurrency = selectedCurrency;
        console.log(`Cart was empty. Setting cart currency to: ${cartCurrency}`);
    } else if (selectedCurrency !== cartCurrency) {
        // Cart is not empty and the selected currency mismatches the cart's currency
        console.warn(`Currency mismatch: Tried to add item in ${selectedCurrency}, but cart contains items in ${cartCurrency}.`);
        alert(`No puedes añadir artículos en ${selectedCurrency} porque tu cesta ya contiene artículos en ${cartCurrency}.\n\nVacía la cesta o cambia la moneda seleccionada para continuar.`);
        return; // Stop processing
    }
    // --- End Currency Check ---

    // Proceed if cart was empty or currencies match
    const idStr = String(productId);
    const existingItemIndex = cartItems.findIndex(item => String(item.id) === idStr);

    if (existingItemIndex > -1) {
        // Item exists, update quantity
        cartItems[existingItemIndex].quantity += quantity;
        // Update price in case it changed (though unlikely for existing item add)
        cartItems[existingItemIndex].price = price;
        console.log(`Updated quantity for item ${idStr} in ${cartCurrency} cart to ${cartItems[existingItemIndex].quantity}`);
    } else {
        // Item doesn't exist, add new item
        cartItems.push({ id: idStr, name, price, quantity });
        console.log(`Added new item ${idStr} to ${cartCurrency} cart`);
    }

    saveCart();
    updateCartDisplay();
    // Optionally trigger update of the cart modal if it's open
    if (typeof window.renderCartItemsIfVisible === 'function') {
        window.renderCartItemsIfVisible();
    }

    // Optional: Trigger a notification or animation
    showAddedToCartFeedback(name, quantity);
}

/**
 * Removes an item entirely from the shopping cart.
 * Resets cart currency if the cart becomes empty.
 * @param {string} productId - The ID of the product to remove.
 */
export function removeFromCart(productId) {
    const idStr = String(productId);
    const initialLength = cartItems.length;
    cartItems = cartItems.filter(item => String(item.id) !== idStr);

    if (cartItems.length < initialLength) {
        console.log(`Removed item ${idStr} from cart`);
        if (cartItems.length === 0) {
            cartCurrency = null; // Reset currency if cart is now empty
            console.log("Cart is now empty. Resetting cart currency.");
        }
        saveCart();
        updateCartDisplay();
        // Optionally trigger update of the cart modal if it's open
        if (typeof window.renderCartItemsIfVisible === 'function') {
            window.renderCartItemsIfVisible();
        }
    } else {
        console.warn(`Item ${idStr} not found in cart for removal.`);
    }
}

/**
 * Decreases the quantity of an item in the cart, removing it if quantity reaches zero.
 * Resets cart currency if the cart becomes empty.
 * @param {string} productId - The ID of the product.
 * @param {number} quantityToRemove - The quantity to decrease by (defaults to 1).
 */
export function decreaseCartItemQuantity(productId, quantityToRemove = 1) {
    const idStr = String(productId);
    const itemIndex = cartItems.findIndex(item => String(item.id) === idStr);

    if (itemIndex > -1) {
        cartItems[itemIndex].quantity -= quantityToRemove;
        if (cartItems[itemIndex].quantity <= 0) {
            // Remove item if quantity is zero or less
            cartItems.splice(itemIndex, 1);
            console.log(`Removed item ${idStr} from cart as quantity reached zero.`);
            if (cartItems.length === 0) {
                cartCurrency = null; // Reset currency if cart is now empty
                 console.log("Cart is now empty. Resetting cart currency.");
            }
        } else {
            console.log(`Decreased quantity for item ${idStr} to ${cartItems[itemIndex].quantity}`);
        }
        saveCart();
        updateCartDisplay();
        // Optionally trigger update of the cart modal if it's open
        if (typeof window.renderCartItemsIfVisible === 'function') {
            window.renderCartItemsIfVisible();
        }
    } else {
        console.warn(`Item ${idStr} not found in cart to decrease quantity.`);
    }
}

/**
 * Clears all items from the shopping cart and resets the cart currency.
 */
export function clearCart() {
    cartItems = [];
    cartCurrency = null; // Reset currency when clearing
    console.log("Cleared all items from cart and reset currency.");
    saveCart();
    updateCartDisplay();
    // Optionally trigger update of the cart modal if it's open
    if (typeof window.renderCartItemsIfVisible === 'function') {
        window.renderCartItemsIfVisible();
    }
}

/**
 * Placeholder for showing feedback to the user when an item is added.
 * @param {string} name - Name of the product added.
 * @param {number} quantity - Quantity added.
 */
function showAddedToCartFeedback(name, quantity) {
    console.log(`Added ${quantity} x ${name} to cart!`);
    // Example: Briefly change the buy button text or show a small notification
    // This could be expanded into a more visible UI element.
}

/**
 * Initializes the cart by loading data and updating the display.
 * Should be called once when the application loads.
 */
export function initializeCart() {
    console.log("Initializing cart...");
    loadCart();
    updateCartDisplay();
}