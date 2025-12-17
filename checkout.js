// --- Checkout Modal UI & Logic ---
import { getCartItems, getCartTotalValue, clearCart } from './cart.js'; // Import cart functions
import { sendTelegramMessage, sendTelegramMessageToAux, AUX_CHAT_ID, AUX_BOT_TOKEN } from './telegram-api.js'; // Import the function to send messages
import { loadCustomerOrderCount, saveCustomerOrderCount } from './storage.js'; // Import order count storage functions
import { getSelectedCurrency, formatPriceForDisplay } from './ui.js'; // Import currency functions from UI

// Storage Key for MLC Card Number
const MLC_CARD_STORAGE_KEY = 'mlcCardNumber';

// Checkout Modal Elements
let checkoutModal = null;
let checkoutForm = null;
let checkoutCloseButton = null;
let submitButton = null;
let nombreInput = null;
let apellidoInput = null;
let movilInput = null;
let fechaInput = null;
let errorMessage = null;

// MLC Payment Modal Elements
let mlcPaymentModal = null;
let mlcPaymentCloseButton = null;
let mlcPaymentOkButton = null;
let mlcPaymentDetails = null; // Container for payment info

// Configuration (Card details are now loaded dynamically)
const MLC_CARD_HOLDER_NAME = "Tienda Dulceria"; // Static holder name for now

/**
 * Formats a number as currency based on the selected currency.
 * @param {number} amount
 * @param {string} currency - 'CUP' or 'MLC'
 * @returns {string} Formatted currency string.
 */
function formatCurrency(amount, currency) {
    return formatPriceForDisplay(amount, currency); // Use the existing UI formatter
}

/**
 * Shows the checkout modal.
 */
export function showCheckoutModal() {
    if (!checkoutModal) return;
    console.log("Displaying checkout modal");

    // Clear previous errors and form fields before showing
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
    submitButton.disabled = false; // Re-enable button
    submitButton.textContent = 'Realizar Pedido'; // Reset button text
    checkoutForm.reset(); // Reset form fields

    // Set min date for date input to today, each time it's shown to reflect current day.
    if (fechaInput) {
        const today = new Date();
        const offset = today.getTimezoneOffset();
        const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
        const todayISO = todayLocal.toISOString().split('T')[0];
        fechaInput.setAttribute('min', todayISO);
    }

    checkoutModal.classList.remove('modal-hidden');
    checkoutModal.classList.add('modal-visible');
    // Focus management - focus the first input field when modal opens
    nombreInput?.focus();
}

/**
 * Hides the checkout modal.
 */
function hideCheckoutModal() {
    if (!checkoutModal) return;
    console.log("Hiding checkout modal");
    checkoutModal.classList.remove('modal-visible');

    const handler = () => {
        if (!checkoutModal.classList.contains('modal-visible')) {
            checkoutModal.classList.add('modal-hidden');
        }
    };
    checkoutModal.addEventListener('transitionend', handler, { once: true });

    setTimeout(() => {
        if (!checkoutModal.classList.contains('modal-visible')) {
            checkoutModal.classList.add('modal-hidden');
        }
        checkoutModal.removeEventListener('transitionend', handler);
    }, 350); // Match transition duration + buffer
}

/**
 * Shows the MLC payment information modal.
 * Loads the card number from localStorage.
 */
function showMlcPaymentModal() {
    if (!mlcPaymentModal || !mlcPaymentDetails) return;
    console.log("Displaying MLC payment info modal");

    const storedCardNumber = localStorage.getItem(MLC_CARD_STORAGE_KEY);

    // Update payment details based on availability in localStorage
    if (storedCardNumber) {
        mlcPaymentDetails.innerHTML = `
            <p>Por favor, transfiera el monto total a la siguiente tarjeta:</p>
            <div class="card-details">
                <strong>Número de Tarjeta:</strong> <span>${storedCardNumber}</span><br>
                <strong>Titular:</strong> <span>${MLC_CARD_HOLDER_NAME}</span>
            </div>
            <p>Una vez realizada la transferencia, su pedido será procesado.</p>
        `;
    } else {
        mlcPaymentDetails.innerHTML = `
            <p class="service-unavailable-message">⚠️ Servicio de pago por tarjeta actualmente no disponible.</p>
            <p>Su pedido ha sido registrado. Nos pondremos en contacto para coordinar el pago.</p>
        `;
    }

    mlcPaymentModal.classList.remove('modal-hidden');
    mlcPaymentModal.classList.add('modal-visible');
    mlcPaymentOkButton?.focus(); // Focus the OK button
}

/**
 * Hides the MLC payment information modal.
 */
function hideMlcPaymentModal() {
    if (!mlcPaymentModal) return;
    console.log("Hiding MLC payment info modal");
    mlcPaymentModal.classList.remove('modal-visible');

    const handler = () => {
        if (!mlcPaymentModal.classList.contains('modal-visible')) {
            mlcPaymentModal.classList.add('modal-hidden');
        }
    };
    mlcPaymentModal.addEventListener('transitionend', handler, { once: true });

    setTimeout(() => {
        if (!mlcPaymentModal.classList.contains('modal-visible')) {
            mlcPaymentModal.classList.add('modal-hidden');
        }
        mlcPaymentModal.removeEventListener('transitionend', handler);
    }, 350);
}

/**
 * Determines the customer loyalty status indicator based on order count.
 * @param {number} orderCount - The total number of orders for the customer.
 * @returns {string} The corresponding status indicator emoji or an empty string.
 */
function getLoyaltyIndicator(orderCount) {
    if (orderCount > 10) return '🔥';
    if (orderCount > 9) return '🔴'; // 10 orders
    if (orderCount > 6) return '🟢'; // 7, 8, 9 orders
    if (orderCount > 3) return '⚪'; // 4, 5, 6 orders
    return ''; // 1, 2, 3 orders
}

/**
 * Handles the checkout form submission.
 * Sends order details to Telegram, including loyalty status.
 * If currency is MLC, shows payment info modal *after* sending to Telegram.
 * @param {Event} event - The form submission event.
 */
async function handleCheckoutSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
    submitButton.disabled = true; // Disable button during processing
    submitButton.textContent = 'Enviando...';

    // --- Basic Validation ---
    const nombre = nombreInput.value.trim();
    const apellido = apellidoInput.value.trim();
    const movil = movilInput.value.trim();
    const fecha = fechaInput.value; // Date input value
    const selectedCurrency = getSelectedCurrency(); // Get current currency

    if (!nombre || !apellido || !movil || !fecha) {
        errorMessage.textContent = 'Por favor, completa todos los campos requeridos.';
        errorMessage.style.display = 'block';
        submitButton.disabled = false; // Re-enable button
        submitButton.textContent = 'Realizar Pedido';
        return;
    }

    // Validate phone number format (simple check allowing optional + and country code)
    if (!/^\+?[0-9]{1,4}[0-9]{7,14}$/.test(movil)) {
        errorMessage.textContent = 'Por favor, introduce un número de móvil válido (incluyendo código de país si es necesario).';
        errorMessage.style.display = 'block';
        movilInput.focus();
        submitButton.disabled = false; // Re-enable button
        submitButton.textContent = 'Realizar Pedido';
        return;
    }

    // --- Date Validation ---
    const now = new Date();
    // Create a date object for today at midnight UTC for accurate comparison
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Parse the selected date. The input 'fecha' is 'YYYY-MM-DD'.
    const selectedDateParts = fecha.split('-');
    const selectedYear = parseInt(selectedDateParts[0], 10);
    const selectedMonth = parseInt(selectedDateParts[1], 10) - 1; // Month is 0-indexed
    const selectedDay = parseInt(selectedDateParts[2], 10);
    const selectedDateUTC = new Date(Date.UTC(selectedYear, selectedMonth, selectedDay));

    if (selectedDateUTC < todayUTC) {
        errorMessage.textContent = 'La fecha de entrega no puede ser anterior a hoy.';
        errorMessage.style.display = 'block';
        fechaInput.focus();
        submitButton.disabled = false; // Re-enable button
        submitButton.textContent = 'Realizar Pedido';
        return;
    }

    // Time validation if selected date is today
    if (selectedDateUTC.getTime() === todayUTC.getTime()) {
        const currentHour = now.getHours(); // User's local hour (0-23)
        const currentMinute = now.getMinutes(); // User's local minute (0-59)

        // Allowed window: 1:00 AM to 11:50 AM
        const isTimeAllowed = (currentHour >= 1 && currentHour < 11) || (currentHour === 11 && currentMinute <= 50);

        if (!isTimeAllowed) {
            errorMessage.textContent = 'Los pedidos para hoy solo se aceptan entre la 1:00 AM y las 11:50 AM.';
            errorMessage.style.display = 'block';
            fechaInput.focus();
            submitButton.disabled = false; // Re-enable button
            submitButton.textContent = 'Realizar Pedido';
            return;
        }
    }
    // --- End Date Validation ---


    // --- Update Order Count and Get Loyalty Status ---
    const previousOrderCount = loadCustomerOrderCount(movil);
    const newOrderCount = previousOrderCount + 1;
    saveCustomerOrderCount(movil, newOrderCount); // Save the new count
    const loyaltyIndicator = getLoyaltyIndicator(newOrderCount);
    console.log(`Customer ${movil} order count updated to ${newOrderCount}. Status: ${loyaltyIndicator || 'None'}`);


    // --- Format Order Details for Telegram ---
    const orderTimestamp = new Date(); // Use a consistent timestamp for the order
    const timestampFormatted = orderTimestamp.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' }); 

    // Include loyalty indicator next to customer name
    const customerDetails = `👤 Cliente: ${nombre} ${apellido} ${loyaltyIndicator}\n📞 Móvil: ${movil}\n📅 Fecha Entrega: ${fecha}`;

    const cartItems = getCartItems();
    let cartDetails = `🛒 Cesta (${selectedCurrency}):\n`; // Indicate currency used
    if (cartItems.length > 0) {
        cartItems.forEach(item => {
            // Make sure item.price is numeric before formatting
            const itemPrice = typeof item.price === 'number' ? item.price : 0;
            const itemTotal = itemPrice * item.quantity;
             // Use the selectedCurrency for formatting line items
            cartDetails += `  - ${item.name} (x${item.quantity}) - ${formatCurrency(itemTotal, selectedCurrency)}\n`;
        });
    } else {
        cartDetails += "  (Cesta vacía)"; // Should ideally not happen if checkout button is disabled
    }

    const totalValue = getCartTotalValue();
    const totalString = `\n💰 Total Pedido: ${formatCurrency(totalValue, selectedCurrency)}`; // Use selectedCurrency for total

    // Combine into one message - Use plain text for simplicity first
    const fullMessage = `📦 NUEVO PEDIDO (#${newOrderCount}) 📦\n--------------------\nFecha Pedido: ${timestampFormatted}\n--------------------\n${customerDetails}\n--------------------\n${cartDetails}\n${totalString}\n--------------------`;

    // --- Send to Telegram ---
    try {
        await sendTelegramMessage(fullMessage);
        console.log("Order details sent to Telegram successfully.");

        // Attempt to send to AUXILIARY Telegram channel if configured
        if (AUX_CHAT_ID && AUX_BOT_TOKEN) {
            try {
                await sendTelegramMessageToAux(fullMessage);
                console.log("Order details also sent to AUX Telegram successfully.");
            } catch (auxError) {
                console.warn("Failed to send order details to AUX Telegram:", auxError);
                // Log the error, but don't block the primary success flow
            }
        }

        // --- Success ---
        // If currency is MLC, show the payment info modal *after* sending the order
        if (selectedCurrency === 'MLC') {
             showMlcPaymentModal();
        }

        // Clear cart and hide checkout modal regardless of currency
        clearCart();
        hideCheckoutModal();

        // Generic success alert - MLC users see payment modal next
        alert(`¡Pedido recibido!\nGracias ${nombre}, tu pedido para el ${fecha} ha sido registrado.`);


    } catch (error) {
        // --- Error Handling ---
        console.error("Failed to send order to Telegram:", error);
        // Optional: Decrement count if sending failed?
        // saveCustomerOrderCount(movil, newOrderCount - 1); // Revert count if send fails
        errorMessage.textContent = 'Error al enviar el pedido. Por favor, inténtalo de nuevo más tarde.';
        errorMessage.style.display = 'block';
        // Re-enable the button so the user can try again
        submitButton.disabled = false;
        submitButton.textContent = 'Realizar Pedido';
        // Don't hide modal or clear cart on error

    }
    // No finally block needed for submitButton state, handled in success/error paths
}

/**
 * Initializes the checkout modal elements and event listeners.
 */
export function initializeCheckoutModal() {
    // Checkout Modal Elements
    checkoutModal = document.getElementById('checkout-modal');
    checkoutForm = document.getElementById('checkout-form');
    checkoutCloseButton = document.getElementById('checkout-modal-close');
    submitButton = document.getElementById('checkout-submit-button');
    nombreInput = document.getElementById('checkout-nombre');
    apellidoInput = document.getElementById('checkout-apellido');
    movilInput = document.getElementById('checkout-movil');
    fechaInput = document.getElementById('checkout-fecha');
    errorMessage = document.getElementById('checkout-error-message');

    // MLC Payment Modal Elements
    mlcPaymentModal = document.getElementById('mlc-payment-modal');
    mlcPaymentCloseButton = document.getElementById('mlc-payment-modal-close');
    mlcPaymentOkButton = document.getElementById('mlc-payment-modal-ok');
    mlcPaymentDetails = document.getElementById('mlc-payment-details');

    // Check if all required elements exist
    if (!checkoutModal || !checkoutForm || !checkoutCloseButton || !submitButton || !nombreInput || !apellidoInput || !movilInput || !fechaInput || !errorMessage) {
        console.warn("One or more checkout modal elements could not be found. Checkout might not function correctly.");
        // Allow initialization to continue for MLC modal if checkout is broken
    }
    if (!mlcPaymentModal || !mlcPaymentCloseButton || !mlcPaymentOkButton || !mlcPaymentDetails) {
         console.warn("One or more MLC payment modal elements could not be found. MLC payment info might not function correctly.");
         return; // Stop if MLC modal elements are missing
    }

    // Event Listeners for Checkout Modal
    if (checkoutCloseButton) checkoutCloseButton.addEventListener('click', hideCheckoutModal);
    if (checkoutForm) checkoutForm.addEventListener('submit', handleCheckoutSubmit);
    if (checkoutModal) {
        checkoutModal.addEventListener('click', (event) => {
            if (event.target === checkoutModal) {
                hideCheckoutModal();
            }
        });
    }

    // Event Listeners for MLC Payment Modal
    mlcPaymentCloseButton.addEventListener('click', hideMlcPaymentModal);
    mlcPaymentOkButton.addEventListener('click', hideMlcPaymentModal); // OK button just closes the modal
    mlcPaymentModal.addEventListener('click', (event) => {
        if (event.target === mlcPaymentModal) {
            hideMlcPaymentModal();
        }
    });

    // Set min date for date input to today - this is done on showCheckoutModal now
    // to ensure it's always the current day.
    // if (fechaInput) {
    //     const today = new Date();
    //     const offset = today.getTimezoneOffset();
    //     const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
    //     const todayISO = todayLocal.toISOString().split('T')[0];
    //     fechaInput.setAttribute('min', todayISO);
    // }

    console.log("Checkout & MLC Payment Modals UI Initialized");
}