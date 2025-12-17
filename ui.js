// --- UI Update Functions ---
import { saveChatHistory } from './storage.js';
import { addToCart } from './cart.js';
// Import the function to send Telegram messages
import { sendTelegramMessage, sendTelegramMessageToAux, AUX_CHAT_ID, AUX_BOT_TOKEN } from './telegram-api.js';

// DOM Elements Caching (improves performance slightly if elements exist)
const tickerElement = document.getElementById('top-panel-ticker');
const tickerContentElement = tickerElement?.querySelector('.ticker-content');
const productGrid = document.querySelector('.product-grid'); // Cache grid reference
const currencyToggle = document.getElementById('currency-toggle'); // Cache currency switch

// State variables for notifications
let notificationContainer = null;

// Roulette Game Modal Elements (initialize later or grab as needed)
let rouletteResultModal = null;
let rouletteResultCloseButton = null;
let rouletteResultMessage = null;
let rouletteResultOkButton = null;

// Lightbox Modal Elements
let lightbox = null;
let lightboxImage = null;
let lightboxCloseButton = null;

// Roulette Game Constants
const ROULETTE_SPIN_DURATION = 3000; // ms for spinning animation
const ROULETTE_WIN_PROBABILITY = 0.15; // 15% chance to win

// --- Notification Functions ---
/**
 * Shows a temporary notification message on the screen.
 * @param {string} message - The message text to display.
 * @param {number} duration - How long the notification should stay (in milliseconds). Defaults to 10 seconds.
 */
export function showNotification(message, duration = 10000) {
    if (!notificationContainer) {
        notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            console.error("Notification container not found.");
            return;
        }
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
        console.warn("Attempted to show an empty notification.");
        return;
    }

    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message.trim();

    notificationContainer.appendChild(notification);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });
    });


    setTimeout(() => {
        notification.classList.remove('show');
        notification.addEventListener('transitionend', () => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, { once: true });
        setTimeout(() => {
             if (notification.parentNode) {
                 notification.remove();
             }
        }, 600);
    }, duration);
}

/**
 * Creates and displays a clickable roulette button in the notification area.
 * Persists until clicked the allowed number of times. Triggers a simple game on click.
 * @param {string} attemptsStr - The number of attempts allowed (as a string).
 * @param {string} winHour - The hour (0-23) when winning is guaranteed.
 * @param {string} code - The code associated with the roulette win.
 */
export function showRouletteButton(attemptsStr, winHour, code) {
    // No longer need to find notification container for this.

    // Remove any existing roulette button from the body
    const existingButton = document.querySelector('.roulette-button');
    existingButton?.remove();

    const button = document.createElement('button');
    button.type = 'button'; // Ensure it's a button element
    button.className = 'roulette-button'; // No longer needs .notification class
    button.dataset.attempts = attemptsStr; // Store initial attempts as string
    button.dataset.winHour = winHour.toString(); // Store win hour
    button.dataset.code = code; // Store code
    button.innerHTML = `🎰`; // Content with ONLY the emoji
    button.setAttribute('aria-label', `Jugar a la ruleta de regalos (${attemptsStr} intentos restantes)`); // Accessibility with initial attempts

    // Add click listener to play the game
    button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent potential container clicks if any

        // Read current attempts from the button's dataset
        let currentAttempts = parseInt(button.dataset.attempts || '0', 10);
        const clickedWinHour = parseInt(button.dataset.winHour, 10);
        const clickedCode = button.dataset.code;

        console.log(`Roulette button clicked! Attempts remaining: ${currentAttempts}, WinHour: ${clickedWinHour}, Code: ${clickedCode}`);

        if (currentAttempts > 0) {
            // Decrement attempts
            currentAttempts--;
            button.dataset.attempts = currentAttempts.toString(); // Update dataset
            button.setAttribute('aria-label', `Jugar a la ruleta de regalos (${currentAttempts} intentos restantes)`); // Update label

            // Play the game
            startRouletteGame(clickedWinHour, clickedCode);

            // If attempts reach zero, fade out and remove the button
            if (currentAttempts <= 0) {
                console.log("No more attempts remaining. Removing roulette button.");
                button.disabled = true; // Disable immediately
                // Fade out and remove by toggling the .show class
                button.classList.remove('show');
                button.addEventListener('transitionend', () => {
                    if (button.parentNode) {
                         button.remove();
                    }
                }, { once: true });
                // Fallback removal
                 setTimeout(() => {
                      if (button.parentNode) {
                          button.remove();
                      }
                 }, 600); // Match transition duration + buffer
            }
        } else {
            // Should not happen if button is removed/disabled correctly, but good failsafe
            console.log("Clicked with zero attempts, button should have been removed.");
            if (button.parentNode) {
                button.remove();
            }
        }
    });

    document.body.appendChild(button); // Append directly to the body

    // Trigger the animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            button.classList.add('show'); // Use 'show' class to trigger slide-in
        });
    });

     // Unlike notifications, this doesn't automatically disappear unless clicked or attempts run out
}

/**
 * Handles the submission of the raffle subscription form shown when winning the roulette.
 * Sends the collected data and prize code to Telegram.
 * @param {Event} event - The form submission event.
 * @param {string} prizeCode - The prize code associated with this win.
 */
async function handleRaffleFormSubmit(event, prizeCode) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const errorMessageElement = form.querySelector('.raffle-error-message');

    if (!form || !submitButton || !errorMessageElement) {
        console.error("Raffle form elements missing.");
        return;
    }

    // Clear previous errors
    errorMessageElement.textContent = '';
    errorMessageElement.style.display = 'none';
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando...';

    // Get form data
    const nombreInput = form.querySelector('#raffle-nombre');
    const apellidoInput = form.querySelector('#raffle-apellido');
    const movilInput = form.querySelector('#raffle-movil');

    const nombre = nombreInput ? nombreInput.value.trim() : '';
    const apellido = apellidoInput ? apellidoInput.value.trim() : '';
    const movil = movilInput ? movilInput.value.trim() : '';

    // Basic Validation
    if (!nombre || !apellido || !movil) {
        errorMessageElement.textContent = 'Por favor, completa todos los campos.';
        errorMessageElement.style.display = 'block';
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar Suscripción';
        return;
    }

    // Validate phone number format (allowing optional + and country code)
    // Uses the same pattern as the checkout modal
    if (!/^\+?[0-9]{1,4}[0-9]{7,14}$/.test(movil)) {
        errorMessageElement.textContent = 'Por favor, introduce un número de móvil válido (ej: +535xxxxxxx).';
        errorMessageElement.style.display = 'block';
        movilInput?.focus();
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar Suscripción';
        return;
    }

    // Format Telegram Message
    const messageText = `🎉 Nueva Suscripción Rifa (Ruleta) 🎉
--------------------
👤 Nombre: ${nombre} ${apellido}
📞 Móvil: ${movil}
🎁 Código Rifa: ${prizeCode}
--------------------`;

    try {
        await sendTelegramMessage(messageText);
        console.log(`Successfully sent raffle subscription data for code "${prizeCode}" via Telegram.`);

        // Attempt to send to AUXILIARY Telegram channel if configured
        if (AUX_CHAT_ID && AUX_BOT_TOKEN) {
            try {
                await sendTelegramMessageToAux(messageText);
                console.log(`Raffle subscription also sent to AUX Telegram for code "${prizeCode}".`);
            } catch (auxError) {
                console.warn(`Failed to send raffle subscription to AUX Telegram for code "${prizeCode}":`, auxError);
                // Log the error, but don't block the primary success flow
            }
        }

        // Show success message in modal body
        updateRouletteResultModalContent(`
            <div class="prize-reveal">
                <h3>¡Suscripción Enviada! <span class="confetti">✅</span></h3>
                <p>Gracias ${nombre}, tus datos para la rifa han sido registrados.</p>
                <p>¡Mucha suerte!</p>
            </div>
        `);
        // Hide the main OK button as the action is complete
        if (rouletteResultOkButton) rouletteResultOkButton.style.display = 'none';

        // Optionally close modal after a delay
        setTimeout(hideRouletteResultModal, 4000); // Close after 4 seconds

    } catch (error) {
        console.error(`Failed to send raffle subscription data for code "${prizeCode}" via Telegram:`, error);
        errorMessageElement.textContent = 'Error al enviar los datos. Inténtalo de nuevo.';
        errorMessageElement.style.display = 'block';
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar Suscripción';
    }
}

/**
 * Starts the roulette game simulation. Displays the modal with a spinning animation
 * and then reveals the outcome (win or lose).
 * If the user wins, a form is displayed to collect raffle subscription details.
 * @param {number} winHour - The specific hour (0-23) when winning is guaranteed.
 * @param {string} prizeCode - The potential prize code if the player wins.
 */
function startRouletteGame(winHour, prizeCode) {
    const spinningContent = `
        <div class="roulette-spinner-container">
             <div class="roulette-wheel">
                <div class="wheel-inner"></div>
                <div class="wheel-arrow">▼</div>
            </div>
            <p>Girando la ruleta...</p>
        </div>
    `;
    // Make sure OK button is visible initially
    if (rouletteResultOkButton) rouletteResultOkButton.style.display = 'block';

    showRouletteResultModal(spinningContent);

    // Simulate spinning for a set duration
    setTimeout(() => {
        // --- Determine win condition ---
        const currentHour = new Date().getHours(); // Get current hour (0-23)
        const isGuaranteedWinTime = (currentHour === winHour);
        const randomWin = Math.random() < ROULETTE_WIN_PROBABILITY;
        const didWin = isGuaranteedWinTime || randomWin;
        // --- End win condition ---

        let resultMessageHTML = '';

        if (didWin) {
            console.log(`Roulette Result: WIN! Prize Code: ${prizeCode}. (Guaranteed: ${isGuaranteedWinTime})`);
            resultMessageHTML = `
                <div class="prize-reveal">
                    <h3>¡Felicidades! <span class="confetti">🎉</span></h3>
                    <p>¡Has ganado una <strong>suscripción gratuita</strong> para nuestra próxima rifa!</p>
                    <p>Introduce tus datos para registrarte:</p>
                </div>
                <form id="raffle-subscription-form" class="raffle-form">
                    <input type="hidden" name="prizeCode" value="${prizeCode}">
                    <div class="form-group">
                        <label for="raffle-nombre">Nombre:</label>
                        <input type="text" id="raffle-nombre" name="nombre" required>
                    </div>
                    <div class="form-group">
                        <label for="raffle-apellido">Apellido:</label>
                        <input type="text" id="raffle-apellido" name="apellido" required>
                    </div>
                    <div class="form-group">
                        <label for="raffle-movil">Número de Móvil:</label>
                        <input type="tel" id="raffle-movil" name="movil" required
                               pattern="^\\+?[0-9]{1,4}[0-9]{7,14}$"
                               title="Incluye el código de país (ej: +535xxxxxxx)"
                               placeholder="+XX XXXXXXXXX">
                    </div>
                    <p class="raffle-error-message" style="display: none; color: #e63946; font-size: 0.9em; margin-top: 10px;"></p>
                    <div class="form-actions">
                         <button type="submit" class="submit-raffle-button">Enviar Suscripción</button>
                    </div>
                </form>
            `;
            // Update modal content with the form
            updateRouletteResultModalContent(resultMessageHTML);

            // Attach submit listener to the new form
            const raffleForm = document.getElementById('raffle-subscription-form');
            if (raffleForm) {
                raffleForm.addEventListener('submit', (event) => handleRaffleFormSubmit(event, prizeCode));
            }
            // Hide the main modal OK button as the form has its own submit
            if (rouletteResultOkButton) rouletteResultOkButton.style.display = 'none';

        } else {
            console.log("Roulette Result: LOSE");
            resultMessageHTML = `
                <div class="prize-reveal">
                     <h3>¡Casi! <span class="confetti">😅</span></h3>
                    <p>No hubo suerte esta vez.</p>
                    <p>¡Sigue intentándolo en futuras compras!</p>
                    <p><small>(El botón de ruleta puede aparecer de nuevo)</small></p>
                </div>
            `;
            // Update modal content with the losing message
            updateRouletteResultModalContent(resultMessageHTML);
             // Keep OK button visible for losing scenario
            if (rouletteResultOkButton) rouletteResultOkButton.style.display = 'block';
        }

    }, ROULETTE_SPIN_DURATION);
}

/**
 * Grabs roulette modal elements if not already cached.
 */
function ensureRouletteModalElements() {
    if (!rouletteResultModal) {
        rouletteResultModal = document.getElementById('roulette-result-modal');
        rouletteResultCloseButton = document.getElementById('roulette-result-modal-close');
        rouletteResultMessage = document.getElementById('roulette-result-message');
        rouletteResultOkButton = document.getElementById('roulette-result-modal-ok');

        // Add listeners only once
        if (rouletteResultCloseButton) {
            rouletteResultCloseButton.addEventListener('click', hideRouletteResultModal);
        }
         if (rouletteResultOkButton) {
            rouletteResultOkButton.addEventListener('click', hideRouletteResultModal);
        }
        if (rouletteResultModal) {
            rouletteResultModal.addEventListener('click', (event) => {
                if (event.target === rouletteResultModal) {
                    hideRouletteResultModal();
                }
            });
        }
    }
}

/**
 * Shows the roulette result modal with initial content.
 * @param {string} initialContentHTML - HTML content to display initially.
 */
function showRouletteResultModal(initialContentHTML) {
    ensureRouletteModalElements();
    if (!rouletteResultModal || !rouletteResultMessage) {
         console.error("Roulette result modal elements not found.");
         return;
    }
    console.log("Displaying roulette result modal");

    rouletteResultMessage.innerHTML = initialContentHTML; // Set initial content

    rouletteResultModal.classList.remove('modal-hidden');
    rouletteResultModal.classList.add('modal-visible');
    // Focus OK button by default, if form is shown, focus will move later
    rouletteResultOkButton?.focus();
}

/**
 * Updates the content of the already visible roulette result modal.
 * @param {string} contentHTML - HTML content to display.
 */
function updateRouletteResultModalContent(contentHTML) {
     ensureRouletteModalElements();
    if (!rouletteResultMessage) return;
    rouletteResultMessage.innerHTML = contentHTML;
}

/**
 * Hides the roulette result modal.
 */
function hideRouletteResultModal() {
    ensureRouletteModalElements();
    if (!rouletteResultModal) return;
    console.log("Hiding roulette result modal");
    rouletteResultModal.classList.remove('modal-visible');

    const handler = () => {
        if (!rouletteResultModal.classList.contains('modal-visible')) {
            rouletteResultModal.classList.add('modal-hidden');
        }
        rouletteResultModal.removeEventListener('transitionend', handler);
    };
    rouletteResultModal.addEventListener('transitionend', handler, { once: true });

    // Fallback to ensure hiding
    setTimeout(() => {
        if (!rouletteResultModal.classList.contains('modal-visible')) {
            rouletteResultModal.classList.add('modal-hidden');
        }
        rouletteResultModal.removeEventListener('transitionend', handler);
    }, 350); // Match transition duration + buffer
}

// --- Currency State ---
const CURRENCY_STORAGE_KEY = 'selectedCurrency';
let currentCurrency = 'CUP'; // Default currency

/**
 * Sets the selected currency, updates UI, and saves preference.
 * @param {string} currency - 'CUP' or 'MLC'.
 */
export function setSelectedCurrency(currency) {
    if (currency !== 'CUP' && currency !== 'MLC') {
        console.warn(`Invalid currency set: ${currency}. Defaulting to CUP.`);
        currency = 'CUP';
    }
    if (currency !== currentCurrency) {
        console.log(`Switching currency to ${currency}`)
        currentCurrency = currency;
        localStorage.setItem(CURRENCY_STORAGE_KEY, currency);

        if (currencyToggle) {
            currencyToggle.checked = (currency === 'MLC');
        }

        updateAllProductPriceDisplays();

        // If cart modal is open, re-render it to show correct prices
        if (typeof window.renderCartItemsIfVisible === 'function') {
           window.renderCartItemsIfVisible(); // Ensure cart display updates currency too
        }
    }
}

/**
 * Gets the currently selected currency.
 * @returns {string} 'CUP' or 'MLC'.
 */
export function getSelectedCurrency() {
    return currentCurrency;
}

/**
 * Initializes the currency switch state from localStorage and adds listener.
 */
export function initializeCurrencySwitch() {
    const savedCurrency = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (savedCurrency === 'MLC') {
        currentCurrency = 'MLC';
        if (currencyToggle) currencyToggle.checked = true;
    } else {
        currentCurrency = 'CUP'; // Default to CUP if not 'MLC' or not set
        if (currencyToggle) currencyToggle.checked = false;
    }
    console.log(`Initialized currency to ${currentCurrency}`);

    if (currencyToggle) {
        currencyToggle.addEventListener('change', (event) => {
            setSelectedCurrency(event.target.checked ? 'MLC' : 'CUP');
        });
    } else {
        console.warn("Currency toggle switch element not found.");
    }
    updateAllProductPriceDisplays();
}

/**
* Updates the price display on all product cards based on the current currency.
*/
function updateAllProductPriceDisplays() {
    const productCards = productGrid?.querySelectorAll('.product-card');
    if (!productCards) return;

    productCards.forEach(card => {
        const productId = card.dataset.productId;
        const productData = loadProductData(productId); // Load data from localStorage
        const priceElement = card.querySelector('.product-price');

        if (productData && priceElement) {
            const price = (currentCurrency === 'MLC') ? productData.priceMLC : productData.priceCUP;
            const formattedPrice = formatPriceForDisplay(price, currentCurrency);
            priceElement.textContent = formattedPrice;
        } else if (priceElement) {
            // Handle case where product data might be missing but card exists
            priceElement.textContent = formatPriceForDisplay(null, currentCurrency);
        }
    });
}

/**
 * Formats a price value for display with the correct currency code.
 * Handles null/undefined prices gracefully.
 * @param {number|string|null} price - The numeric price value or potentially null/undefined.
 * @param {string} currency - 'CUP' or 'MLC'.
 * @returns {string} Formatted price string (e.g., "50 CUP", "1,00 MLC", "-- CUP").
 */
export function formatPriceForDisplay(price, currency) {
    const numericPrice = typeof price === 'string' ? parseFloat(price.replace(',', '.')) : price;

    if (typeof numericPrice === 'number' && !isNaN(numericPrice)) {
        // Always show 2 decimal places for MLC, or for CUP if it has decimals.
        const formattedNumber = (currency === 'MLC' || numericPrice % 1 !== 0)
            ? numericPrice.toFixed(2).replace('.', ',') // Use comma for decimals
            : numericPrice.toString();
        return `${formattedNumber} ${currency}`;
    } else {
        // Display placeholder if price is null, undefined, or NaN
        return `-- ${currency}`;
    }
}

/**
 * Handles currency changes triggered by storage events from other tabs.
 * Exported for use in index.html inline script.
 * @param {string|null} newCurrency
 */
export function handleCurrencyChange(newCurrency) {
    if (newCurrency === 'CUP' || newCurrency === 'MLC') {
        setSelectedCurrency(newCurrency);
    }
}

/**
 * Generates a consistent ID for quantity inputs based on product ID.
 * @param {string|number} productId
 * @returns {string}
 */
function getQuantityInputId(productId) {
    return `qty-${productId}`;
}

/**
 * Helper function to parse price string (e.g., "1,99 €") into a number.
 * @param {string} priceString
 * @returns {number} The parsed price or 0 if parsing fails.
 */
function parsePrice(priceString) {
    if (typeof priceString !== 'string') return 0;
    // Remove currency symbols, thousand separators (like '.'), then replace comma decimal separator with dot
    const cleanedString = priceString.replace(/[€$£]/g, '').replace(/\./g, '').replace(',', '.').trim();
    const price = parseFloat(cleanedString);
    return isNaN(price) ? 0 : price;
}

/**
 * Creates the HTML element for a product card.
 * @param {string} productId - The ID of the product card (e.g., "1").
 * @param {string} name - Product name.
 * @param {string} description - Product description.
 * @param {number|string|null} priceCUP - Price in CUP.
 * @param {number|string|null} priceMLC - Price in MLC.
 * @param {string|null} imageUrl - Image URL or null.
 * @returns {HTMLElement} The created product card element.
 */
function createProductCardElement(productId, name = "Producto Nuevo", description = "Descripción no disponible.", priceCUP = null, priceMLC = null, imageUrl = null) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = productId;

    const imageContainer = document.createElement('div');
    imageContainer.className = 'product-image-container';

    const nameElement = document.createElement('h3');
    nameElement.textContent = name;

    const descriptionElement = document.createElement('p');
    descriptionElement.textContent = description;

    const priceElement = document.createElement('span');
    priceElement.className = 'product-price';
    // Determine initial price based on current global currency setting
    const displayPrice = (getSelectedCurrency() === 'MLC') ? priceMLC : priceCUP;
    const displayCurrency = getSelectedCurrency();
    priceElement.textContent = formatPriceForDisplay(displayPrice, displayCurrency);

    const actions = document.createElement('div');
    actions.className = 'product-actions';

    const qtyLabel = document.createElement('label');
    const qtyId = getQuantityInputId(productId);
    qtyLabel.htmlFor = qtyId;
    qtyLabel.className = 'visually-hidden';
    qtyLabel.textContent = `Cantidad de ${name}`;

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.id = qtyId;
    qtyInput.name = qtyId;
    qtyInput.value = '1';
    qtyInput.min = '1';
    qtyInput.max = '99'; // Standard max quantity
    qtyInput.className = 'quantity-input';
    qtyInput.setAttribute('aria-label', `Cantidad de ${name}`);
    qtyInput.setAttribute('inputmode', 'numeric'); // Hint for numeric keyboard

    const buyButton = document.createElement('button');
    buyButton.type = 'button'; // Ensure it's a button
    buyButton.className = 'buy-button';
    buyButton.textContent = 'Comprar';

    // Add to Cart Button Logic
    buyButton.addEventListener('click', (event) => {
        const button = event.currentTarget;
        const cardElement = button.closest('.product-card');
        if (!cardElement) return;

        const currentProductId = cardElement.dataset.productId;
        const productData = loadProductData(currentProductId); // Reload data to ensure price is correct
        const currentQtyInput = cardElement.querySelector('.quantity-input');

        const quantityValue = currentQtyInput?.value;
        // Validate quantity input is a positive integer
        const currentQuantity = (quantityValue && /^\d+$/.test(quantityValue) && parseInt(quantityValue, 10) > 0) ? parseInt(quantityValue, 10) : 0;

        if (!productData || !currentProductId || currentQuantity <= 0) {
            console.error('Could not read valid product details for adding to cart.', {
                productId: currentProductId, productData, quantity: quantityValue
            });
            alert("Error al añadir al carrito. Producto no encontrado o cantidad inválida.");
            return;
        }

        const selectedCurrency = getSelectedCurrency();
        const priceToAdd = (selectedCurrency === 'MLC') ? productData.priceMLC : productData.priceCUP;

        // Check if the selected currency price is actually available
        if (priceToAdd === null || typeof priceToAdd === 'undefined') {
             console.error(`Price not available for product ${currentProductId} in selected currency ${selectedCurrency}.`);
             alert(`Lo sentimos, este producto no está disponible actualmente en ${selectedCurrency}.`);
             return;
        }

        const currentName = productData.name; // Get name from loaded data
        const numericPriceToAdd = parseFloat(String(priceToAdd).replace(',', '.')) || 0; // Ensure numeric price
        console.log(`Adding to cart: ID=${currentProductId}, Name=${currentName}, Price=${numericPriceToAdd} (${selectedCurrency}), Qty=${currentQuantity}`);

        addToCart(currentProductId, currentName, numericPriceToAdd, currentQuantity);

        // Feedback to user
        button.textContent = 'Añadido!';
        button.disabled = true;
        cardElement.classList.add('added-to-cart-feedback'); // Optional visual feedback class

        // Reset button after a delay
        setTimeout(() => {
            button.textContent = 'Comprar';
            button.disabled = false;
            if (currentQtyInput) currentQtyInput.value = '1'; // Reset quantity input
            cardElement.classList.remove('added-to-cart-feedback'); // Remove visual feedback
        }, 1500);
    });

    actions.appendChild(qtyLabel);
    actions.appendChild(qtyInput);
    actions.appendChild(buyButton);

    card.appendChild(imageContainer);
    card.appendChild(nameElement);
    card.appendChild(descriptionElement);
    card.appendChild(priceElement);
    card.appendChild(actions);

    // Set the initial image or placeholder
    updateImageContainer(imageContainer, name, imageUrl, productId);

    return card;
}

/**
 * Helper function to update the image container content (image or placeholder).
 * @param {HTMLElement} imageContainer - The container element.
 * @param {string} name - Product name (for alt text).
 * @param {string|null} imageUrl - Image URL.
 * @param {string} productId - Product ID (for logging).
 */
function updateImageContainer(imageContainer, name, imageUrl, productId) {
    imageContainer.innerHTML = ''; // Clear previous content

    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = name; // Use product name as alt text
        img.loading = 'lazy'; // Lazy load images
        img.onerror = () => {
            console.warn(`Failed to load image for product ${productId}: ${imageUrl}`);
            imageContainer.innerHTML = ''; // Clear broken image tag
            const placeholder = document.createElement('div');
            placeholder.className = 'product-placeholder-icon error';
            placeholder.textContent = '⚠️'; // Error indicator
            placeholder.setAttribute('aria-label', 'Error al cargar imagen');
            imageContainer.appendChild(placeholder);
        };
        imageContainer.appendChild(img);
    } else {
        // Use placeholder if no image URL provided
        const placeholder = document.createElement('div');
        let icon = '❔'; // Default placeholder
        // Basic keyword matching for common candy types
        const lowerCaseName = name.toLowerCase();
        if (lowerCaseName.includes('gomitas')) icon = '🍬';
        else if (lowerCaseName.includes('chocolate')) icon = '🍫';
        else if (lowerCaseName.includes('chupeta') || lowerCaseName.includes('lollipop')) icon = '🍭';
        else if (lowerCaseName.includes('galleta')) icon = '🍪';
        else if (lowerCaseName.includes('caramelo')) icon = '🍬'; // Use candy emoji for caramel

        placeholder.className = 'product-placeholder-icon default';
        placeholder.textContent = icon;
        placeholder.setAttribute('aria-label', `Placeholder para ${name}`);
        imageContainer.appendChild(placeholder);
    }
}

/**
 * Adds a message to the chat history array and saves it to localStorage.
 * (No visual/DOM manipulation occurs here).
 * @param {string} text - The message text content.
 * @param {string} type - 'sent', 'received', 'system', 'error'.
 * @param {string} sender - The name of the sender.
 * @param {number} timestamp - Unix timestamp of the message.
 * @param {string|null} imageUrl - URL of an image attachment, or null.
 * @param {boolean} save - Whether to save the message to chatHistory and localStorage.
 * @param {Array} chatHistory - The current chat history array (passed from script.js).
 * @param {string} storageKey - The localStorage key (passed from script.js).
 */
export function addMessageToChat(text, type, sender, timestamp, imageUrl = null, save = true, chatHistory, storageKey) {
    // Only save non-system/error messages if 'save' is true and valid history/key provided
    if (save && type !== 'system' && type !== 'error' && Array.isArray(chatHistory) && storageKey) {
        // Basic duplicate check based on timestamp, sender, type, and content
        const lastMessage = chatHistory[chatHistory.length - 1];
        const isDuplicate = lastMessage &&
            lastMessage.timestamp === timestamp &&
            lastMessage.sender === sender &&
            lastMessage.type === type &&
            lastMessage.text === (text || null) && // Handle null/empty text
            lastMessage.imageUrl === (imageUrl || null); // Handle null image

        if (!isDuplicate) {
            chatHistory.push({
                text: text || null, // Store null if text is empty/null
                type,
                sender,
                timestamp,
                imageUrl: imageUrl || null // Store null if imageUrl is empty/null
            });
            // Use a simplified log callback for saving history
            saveChatHistory(storageKey, chatHistory, (msg, errType) => console.error(`[${errType}] Storage: ${msg}`));
        } else {
            // Avoid excessive logging for duplicates unless debugging
            // console.log("Skipping duplicate message save:", { text, type, sender, timestamp });
        }
    }
    // Visual display logic (if any) should be handled elsewhere
}

/**
 * Clears the chat history from localStorage.
 * @param {string} storageKey - The localStorage key for the chat history.
 * @param {function} logCallback - Function to log system messages (e.g., console.log).
 * @returns {Array} An empty array, signifying the cleared history state.
 */
export function clearChat(storageKey, logCallback) {
    console.log("Clearing chat history from storage...");
    try {
        localStorage.removeItem(storageKey);
        if (logCallback) {
            logCallback("Historial de chat eliminado.", 'system', 'Sistema');
        }
    } catch (error) {
         console.error("Error removing chat history from localStorage:", error);
         if (logCallback) {
            logCallback(`Error al eliminar el historial: ${error.message}`, 'error', 'Sistema');
         }
    }
    // Return an empty array to replace the existing chatHistory variable in the calling script
    return [];
}

/**
 * Updates the connection status indicator(s) on the page.
 * Uses class selectors to update potentially multiple status displays.
 * @param {boolean} isConnected - Whether the connection is active.
 * @param {object | null} botInfo - Information about the bot (result from getMe), currently unused visually.
 */
export function updateConnectionStatus(isConnected, botInfo = null) {
    const statusDisplays = document.querySelectorAll('.connection-status-display');
    // Silently return if no status displays found
    if (!statusDisplays || statusDisplays.length === 0) {
        // console.warn("No connection status display elements found to update.");
        return; // Exit if no elements to update
    }

    // Use requestAnimationFrame for smoother DOM updates
    requestAnimationFrame(() => {
        statusDisplays.forEach(display => {
            const indicator = display.querySelector('.status-indicator');
            const textElement = display.querySelector('.status-text');
            // Skip if inner elements are missing for this display
            if (!indicator || !textElement) return; // Continue to next display

            // Toggle classes based on connection state
            indicator.classList.toggle('connected', isConnected);
            indicator.classList.toggle('disconnected', !isConnected);
            // Update text content
            textElement.textContent = isConnected ? 'Conectado' : 'Desconectado';
        });
    });
}

/**
 * Updates the content and visibility of the top panel ticker.
 * @param {string | null} text - The text to display, or null/empty to hide.
 */
export function updateTickerDisplay(text) {
    // Attempt to find elements each time in case they are added dynamically
    const ticker = tickerElement || document.getElementById('top-panel-ticker');
    const content = tickerContentElement || ticker?.querySelector('.ticker-content');

    // Only proceed if both ticker and content elements are found
    if (!ticker || !content) {
        // console.warn("Ticker or ticker content element not found.");
        return; // Exit if essential elements are missing
    }

    if (text && text.trim() !== '') {
        content.textContent = text;
        ticker.style.display = 'block'; // Make ticker visible
        // Restart scrolling animation by removing and re-adding the class
        content.classList.remove('scrolling');
        void content.offsetWidth; // Force reflow/repaint to restart animation
        content.classList.add('scrolling');
    } else {
        // Hide ticker if text is empty or null
        ticker.style.display = 'none'; // Hide ticker
        content.textContent = '';
        content.classList.remove('scrolling'); // Stop animation
    }
}

/**
 * Updates a specific product card in the DOM, creating it if it doesn't exist.
 * Inserts new cards in the correct numerical order based on their ID.
 * @param {string} productId - The ID of the product card (e.g., "1").
 * @param {object} productData - Object containing { name, description, priceCUP, priceMLC, imageUrl }.
 */
export function updateProductCard(productId, productData) {
    const productGrid = document.querySelector('.product-grid');
    if (!productGrid) {
        console.error("Product grid container not found.");
        return;
    }

    let productCard = productGrid.querySelector(`.product-card[data-product-id="${productId}"]`);
    const newProductIdInt = parseInt(productId, 10); // Ensure ID is numeric for comparison
    const { name, description, priceCUP, priceMLC, imageUrl } = productData; // Destructure data

    if (!productCard) {
        // Product card doesn't exist, create and insert it in the correct order
        console.log(`Product card with ID ${productId} not found. Creating and inserting card.`);
        productCard = createProductCardElement(productId, name, description, priceCUP, priceMLC, imageUrl);

        let inserted = false;
        const existingCards = productGrid.querySelectorAll('.product-card');
        // Iterate through existing cards to find the correct insertion point
        for (const existingCard of existingCards) {
            const existingCardIdInt = parseInt(existingCard.dataset.productId, 10);
            if (newProductIdInt < existingCardIdInt) {
                productGrid.insertBefore(productCard, existingCard); // Insert before the first card with a larger ID
                inserted = true;
                break;
            }
        }
        // If not inserted (meaning it's the largest ID or grid was empty), append it
        if (!inserted) {
            productGrid.appendChild(productCard);
        }
        console.log(`Created and inserted/appended product card ${productId}: ${name}`);
        return; // Card created, no need to update further
    }

    // --- Product card exists, update its content ---
    const nameElement = productCard.querySelector('h3');
    const descriptionElement = productCard.querySelector('p');
    const priceElement = productCard.querySelector('.product-price');
    const imageContainer = productCard.querySelector('.product-image-container');
    const quantityInput = productCard.querySelector('.quantity-input');
    const quantityLabel = productCard.querySelector('label.visually-hidden'); // Get the hidden label
    const buyButton = productCard.querySelector('.buy-button'); // Needed for potentially re-enabling

    // Update text content and attributes
    if (nameElement) nameElement.textContent = name;
    if (descriptionElement) descriptionElement.textContent = description;
    if (priceElement) {
        // Update price based on currently selected currency
        const displayPrice = (currentCurrency === 'MLC') ? priceMLC : priceCUP;
        priceElement.textContent = formatPriceForDisplay(displayPrice, currentCurrency);
    }

    // Update quantity input/label attributes for accessibility and association
    if (quantityInput) {
        quantityInput.setAttribute('aria-label', `Cantidad de ${name}`);
        quantityInput.id = getQuantityInputId(productId); // Ensure ID matches
        quantityInput.name = getQuantityInputId(productId); // Ensure name matches
    }
    if (quantityLabel) {
        quantityLabel.htmlFor = getQuantityInputId(productId); // Update 'for' attribute
        quantityLabel.textContent = `Cantidad de ${name}`; // Update label text
    }

    // Update image (using helper function)
    if (imageContainer) {
        updateImageContainer(imageContainer, name, imageUrl, productId);
    }

    // Ensure buy button is enabled if it was previously disabled by add-to-cart feedback
    if (buyButton) {
         buyButton.disabled = false;
         buyButton.textContent = 'Comprar';
    }

    console.log(`Updated product card ${productId}: ${name}`);
}

/**
 * Saves product data to localStorage using a specific key format.
 * @param {string} productId
 * @param {object} data - { name, description, priceCUP, priceMLC, imageUrl }
 */
export function saveProductData(productId, data) {
    try {
        // Basic validation: Ensure ID and data are valid before saving
        if (!productId || typeof data !== 'object' || data === null || typeof data.name === 'undefined') {
            throw new Error("Invalid product ID or data object for saving.");
        }
        // Sanitize price data before saving (convert to number or null)
        const dataToSave = {
            ...data,
            priceCUP: (typeof data.priceCUP === 'number' && !isNaN(data.priceCUP)) ? data.priceCUP : null,
            priceMLC: (typeof data.priceMLC === 'number' && !isNaN(data.priceMLC)) ? data.priceMLC : null,
        };
        localStorage.setItem(`product_data_${productId}`, JSON.stringify(dataToSave));
    } catch (error) {
        console.error(`Error saving product data for ID ${productId}:`, error, data);
    }
}

/**
 * Loads product data from localStorage.
 * @param {string} productId
 * @returns {object|null} The loaded product data or null if not found/error.
 */
export function loadProductData(productId) {
    try {
        const data = localStorage.getItem(`product_data_${productId}`);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error(`Error loading product data for ID ${productId}:`, error);
        localStorage.removeItem(`product_data_${productId}`); 
        return null;
    }
}

/**
 * Loads data for ALL products found in localStorage and populates the grid.
 * Creates or updates cards as needed. Ensures correct order by clearing and rebuilding.
 */
export function loadAllProductData() {
    const productGrid = document.querySelector('.product-grid');
    if (!productGrid) {
        console.error("Product grid not found during loadAllProductData.");
        return;
    }

    console.log("Loading all product data from localStorage...");
    let productDataMap = new Map(); 

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('product_data_')) {
            const productId = key.replace('product_data_', '');
            if (/^\d+$/.test(productId)) {
                const savedData = loadProductData(productId);
                if (savedData) {
                    productDataMap.set(productId, {
                        name: savedData.name ?? "Nombre Perdido",
                        description: savedData.description ?? "Descripción Perdida",
                        priceCUP: savedData.priceCUP ?? null, 
                        priceMLC: savedData.priceMLC ?? null, 
                        imageUrl: savedData.imageUrl ?? null,
                    });
                } else {
                    console.warn(`Data found for key ${key}, but failed to parse or load.`);
                }
            } else {
                console.warn(`Ignoring invalid product key in localStorage: ${key}`);
            }
        }
    }

    const sortedProductIds = Array.from(productDataMap.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    productGrid.innerHTML = '';
    console.log("Cleared existing product grid content before reloading.");

    if (sortedProductIds.length > 0) {
        sortedProductIds.forEach(productId => {
            const productData = productDataMap.get(productId);
            updateProductCard(productId, productData);
        });
        console.log(`Loaded and displayed ${sortedProductIds.length} products in order.`);
    } else {
        console.log("No valid product data found in localStorage. Grid is empty.");
    }

    renumberProducts(); 
}

/**
 * Deletes a product card from the DOM and its data from localStorage.
 * Triggers renumbering of remaining products.
 * @param {string} productIdToDelete - The ID of the product to delete.
 */
export function deleteProduct(productIdToDelete) {
    const productGrid = document.querySelector('.product-grid');
    if (!productGrid) {
        console.error("Product grid container not found for deletion.");
        return;
    }

    const productCard = productGrid.querySelector(`.product-card[data-product-id="${productIdToDelete}"]`);

    if (productCard) {
        productCard.remove();
        console.log(`Removed product card with ID ${productIdToDelete} from DOM.`);

        const storageKey = `product_data_${productIdToDelete}`;
        try {
            localStorage.removeItem(storageKey);
            console.log(`Removed product data for ID ${productIdToDelete} from localStorage.`);
        } catch (error) {
            console.error(`Error removing product data for ID ${productIdToDelete} from localStorage:`, error);
        }

        renumberProducts();

    } else {
        console.warn(`Product card with ID ${productIdToDelete} not found in the DOM to delete.`);
        const storageKey = `product_data_${productIdToDelete}`;
        try {
            if (localStorage.getItem(storageKey)) {
                localStorage.removeItem(storageKey);
                console.log(`Removed potentially orphaned product data for ID ${productIdToDelete} from localStorage.`);
                renumberProducts();
            }
        } catch (error) {
            console.error(`Error removing potentially orphaned product data for ID ${productIdToDelete} from localStorage:`, error);
        }
    }
}

/**
 * Renumbers all product cards sequentially starting from 1.
 * Updates data-product-id, internal elements (labels, inputs), and localStorage keys.
 */
function renumberProducts() {
    console.log("Starting product renumbering process check...");
    const productGrid = document.querySelector('.product-grid');
    if (!productGrid) {
        console.error("Product grid not found for renumbering.");
        return;
    }

    const currentCards = Array.from(productGrid.querySelectorAll('.product-card'));

    if (currentCards.length === 0) {
        console.log("No products to renumber.");
        return;
    }

    let needsRenumbering = false;
    const updates = []; 

    currentCards.forEach((card, index) => {
        const oldId = card.dataset.productId;
        const newId = (index + 1).toString();

        if (oldId !== newId) {
            needsRenumbering = true; 
            console.log(`Renumbering required: Product at index ${index} has ID ${oldId}, should be ${newId}`);

            const oldData = loadProductData(oldId);
            if (!oldData) {
                console.warn(`No data found in localStorage for old product ID ${oldId}. Cannot migrate data.`);
                const nameEl = card.querySelector('h3');
                const descEl = card.querySelector('p');
                const imgEl = card.querySelector('.product-image-container img');
                updates.push({
                    oldId,
                    newId,
                    oldData: { 
                        name: nameEl ? nameEl.textContent : "Nombre Desconocido",
                        description: descEl ? descEl.textContent : "Descripción Desconocida",
                        priceCUP: null,
                        priceMLC: null,
                        imageUrl: imgEl ? imgEl.src : null
                    }
                });
            } else {
                updates.push({ oldId, newId, oldData });
            }

            card.dataset.productId = newId; 

            const quantityInput = card.querySelector('.quantity-input');
            const quantityLabel = card.querySelector('label.visually-hidden');
            const nameElement = card.querySelector('h3');
            const productName = nameElement ? nameElement.textContent : 'Producto';

            if (quantityInput) {
                const newQtyId = getQuantityInputId(newId);
                quantityInput.id = newQtyId;
                quantityInput.name = newQtyId;
                quantityInput.setAttribute('aria-label', `Cantidad de ${productName}`);
            }
            if (quantityLabel) {
                quantityLabel.htmlFor = getQuantityInputId(newId);
            }
        } else {
        }
    });

    if (needsRenumbering) {
        console.log("Phase 2: Updating localStorage entries because renumbering is needed...");
        const keysToRemove = new Set();
        const itemsToSave = new Map();

        updates.forEach(({ oldId, newId, oldData }) => {
            keysToRemove.add(`product_data_${oldId}`);
            if (oldData) {
                itemsToSave.set(`product_data_${newId}`, JSON.stringify(oldData));
            } else {
                keysToRemove.add(`product_data_${newId}`);
            }
        });

        keysToRemove.forEach(key => {
            try {
                if (!itemsToSave.has(key)) {
                    localStorage.removeItem(key);
                }
            } catch (error) {
                console.error(`Error removing localStorage key ${key}:`, error);
            }
        });

        itemsToSave.forEach((jsonData, key) => {
            try {
                localStorage.setItem(key, jsonData);
            } catch (error) {
                console.error(`Error saving localStorage key ${key}:`, error);
            }
        });

        console.log("Product renumbering process completed.");
    } else {
        console.log("Product sequence is already correct. No renumbering needed.");
    }
}

// --- Lightbox Functions ---

/**
 * Sets up the event listener for product image clicks using event delegation.
 */
export function initializeProductImageClickListeners() {
    const grid = document.querySelector('.product-grid');
    if (!grid) return;

    grid.addEventListener('click', (event) => {
        // Check if the click target is inside an image container
        const imageContainer = event.target.closest('.product-image-container');
        if (!imageContainer) return;

        // Find the image element within the container
        const imgElement = imageContainer.querySelector('img');

        // If an image element exists and has a source, show the lightbox
        if (imgElement && imgElement.src) {
            showImageLightbox(imgElement.src, imgElement.alt);
        } else {
            // Optional: Log if a placeholder was clicked
            console.log("Clicked on placeholder or image container without a valid image source.");
        }
    });
    console.log("Product image click listeners initialized.");
}

/**
 * Initializes lightbox elements and close listeners.
 */
export function initializeLightbox() {
    lightbox = document.getElementById('image-lightbox');
    lightboxImage = document.getElementById('lightbox-image');
    lightboxCloseButton = lightbox?.querySelector('.lightbox-close');

    if (!lightbox || !lightboxImage || !lightboxCloseButton) {
        console.warn("Lightbox elements not found. Image enlargement will not work.");
        return;
    }

    // Add event listeners for closing the lightbox
    lightboxCloseButton.addEventListener('click', hideImageLightbox);
    lightbox.addEventListener('click', (event) => {
        // Close only if the click is directly on the background overlay
        if (event.target === lightbox) {
            hideImageLightbox();
        }
    });
    console.log("Image lightbox initialized.");
}

/**
 * Shows the image lightbox with the specified image source and alt text.
 * @param {string} src - The source URL of the image to display.
 * @param {string} alt - The alt text for the image.
 */
function showImageLightbox(src, alt) {
    if (!lightbox || !lightboxImage) {
        console.error("Lightbox elements not available to show image.");
        return;
    }
    console.log(`Showing lightbox for: ${src}`);
    lightboxImage.src = src;
    lightboxImage.alt = alt || "Imagen ampliada"; // Provide default alt text
    lightbox.classList.remove('modal-hidden');
    lightbox.classList.add('modal-visible');
}

/**
 * Hides the image lightbox.
 */
function hideImageLightbox() {
    if (!lightbox) return;
    console.log("Hiding lightbox");
    lightbox.classList.remove('modal-visible');

    // Use transitionend event for smoother hiding and cleanup
    const handler = () => {
        if (!lightbox.classList.contains('modal-visible')) {
            lightbox.classList.add('modal-hidden');
            // Clear the image source only after the modal is hidden
            if (lightboxImage) {
                lightboxImage.src = "";
                lightboxImage.alt = "";
            }
        }
        // Clean up the event listener
        lightbox.removeEventListener('transitionend', handler);
    };
    lightbox.addEventListener('transitionend', handler, { once: true });

    // Fallback timeout to ensure hiding in case transitionend doesn't fire reliably
    setTimeout(() => {
        if (!lightbox.classList.contains('modal-visible')) {
            lightbox.classList.add('modal-hidden');
             if (lightboxImage) {
                lightboxImage.src = "";
                lightboxImage.alt = "";
            }
        }
        lightbox.removeEventListener('transitionend', handler); // Ensure removal in timeout case too
    }, 450); // Slightly longer than the CSS transition (0.4s)
}

/**
 * Hides the initial page loading spinner.
 */
export function hideLoader() {
    const loader = document.getElementById('page-loader');
    if (loader && !loader.classList.contains('hidden')) {
        console.log("Hiding page loader.");
        loader.classList.add('hidden');
        // Optional: Remove from DOM after transition for cleanup
        loader.addEventListener('transitionend', () => {
            if (loader.classList.contains('hidden')) {
                loader.remove();
                console.log("Page loader removed from DOM.");
            }
        }, { once: true });
        // Fallback removal in case transitionend doesn't fire reliably
        setTimeout(() => {
            if (loader && loader.parentNode && loader.classList.contains('hidden')) {
                loader.remove();
                console.log("Page loader removed from DOM (fallback).");
            }
        }, 600); // Should be slightly longer than CSS transition duration (0.5s)
    } else if (loader && loader.classList.contains('hidden')) {
         console.log("Loader already hidden.");
    } else {
        console.warn("Page loader element not found.");
    }
}