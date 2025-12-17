// --- Settings Page Logic ---
import { saveUserApiConfig, loadUserApiConfig, clearUserApiConfig } from './storage.js'; 
import { telegramApiRequest } from './telegram-api.js';

// --- Constants ---
const CORRECT_PASSWORD = "1099109900c";
// Keys are defined in storage.js and imported implicitly via load/saveUserApiConfig

// --- Tweakable Configuration ---
/* @tweakable The duration in seconds to actively poll for remote config after clicking the button. */
const REMOTE_CONFIG_POLL_DURATION_S = 5;

// --- DOM Elements ---
const apiSettingsContainer = document.getElementById('api-settings-container');
const botTokenInput = document.getElementById('settings-bot-token');
const chatIdInput = document.getElementById('settings-chat-id');
const settingsAuxChatIdInput = document.getElementById('settings-aux-chat-id'); 
const settingsAuxBotTokenInput = document.getElementById('settings-aux-bot-token'); 
const saveButton = document.getElementById('save-api-settings-button');
const resetButton = document.getElementById('reset-api-settings-button');
const settingsStatusMsg = document.getElementById('settings-status-message');
const loadRemoteConfigButton = document.getElementById('load-remote-config-button'); // New button
// QR Scanner Elements
const scanQrButton = document.getElementById('scan-qr-button');
const qrScannerModal = document.getElementById('qr-scanner-modal');
const qrScannerCloseButton = document.getElementById('qr-scanner-close');
const qrReaderElement = document.getElementById('qr-reader');
const qrReaderStatus = document.getElementById('qr-reader-status');

// --- State ---
let html5Qrcode = null;
let isPollingForConfig = false;

// --- Functions ---

/**
 * Shows a status message below the settings form.
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if it's an error message, false for success/info.
 */
function showStatusMessage(message, isError = false) {
    if (!settingsStatusMsg) return;
    settingsStatusMsg.textContent = message;
    settingsStatusMsg.className = isError ? 'error-message' : 'status-message'; 
    settingsStatusMsg.style.display = 'block';
    // Don't auto-hide, let the calling function decide
}

/**
 * Hides the status message.
 */
function hideStatusMessage() {
    if (settingsStatusMsg) {
        settingsStatusMsg.style.display = 'none';
    }
}

/**
 * Handles the save button click.
 * Saves the API token, Chat ID, Auxiliary Chat ID, and Auxiliary Bot Token to localStorage.
 */
function handleSave() {
    if (!botTokenInput || !chatIdInput || !settingsAuxChatIdInput || !settingsAuxBotTokenInput) return;

    const botToken = botTokenInput.value.trim();
    const chatId = chatIdInput.value.trim();
    const auxChatId = settingsAuxChatIdInput.value.trim(); 
    const auxBotToken = settingsAuxBotTokenInput.value.trim(); 

    if (!botToken || !chatId) { 
        showStatusMessage("El Token y el Chat ID principal no pueden estar vacíos.", true);
        return;
    }
    // Aux Chat ID and Aux Bot Token can be empty. If Aux Bot Token is provided, Aux Chat ID should ideally also be.
    if (auxBotToken && !auxChatId) {
        showStatusMessage("Si se proporciona un Token Auxiliar, también se debe proporcionar un Chat ID Auxiliar.", true);
        return;
    }

    saveUserApiConfig(botToken, chatId, auxChatId, auxBotToken); 
    showStatusMessage("¡Configuración guardada! Estos serán los nuevos valores predeterminados para este navegador. Recarga la página para aplicar.", false);
    setTimeout(hideStatusMessage, 4000);
}

/**
 * Handles the reset button click.
 * Clears the user-defined API config from localStorage.
 */
function handleReset() {
    if (confirm("¿Estás seguro de que quieres restablecer la configuración de API a los valores predeterminados?")) {
        clearUserApiConfig(); 
        if (botTokenInput) botTokenInput.value = '';
        if (chatIdInput) chatIdInput.value = '';
        if (settingsAuxChatIdInput) settingsAuxChatIdInput.value = ''; 
        if (settingsAuxBotTokenInput) settingsAuxBotTokenInput.value = ''; 
        showStatusMessage("Configuración restablecida a los valores predeterminados. Recarga la página para aplicar.", false);
        setTimeout(hideStatusMessage, 4000);
    }
}

/**
 * Parses a message text to find a remote config JSON.
 * @param {string} text - The message text.
 * @returns {object|null} The parsed config object or null.
 */
function parseRemoteConfig(text) {
    if (text && text.trim().startsWith('{')) {
        try {
            const config = JSON.parse(text);
            if (config && typeof config === 'object' && config.token && config.chatId) {
                return {
                    token: String(config.token),
                    chatId: String(config.chatId),
                    auxBotToken: config.auxBotToken ? String(config.auxBotToken) : '',
                    auxChatId: config.auxChatId ? String(config.auxChatId) : '',
                };
            }
        } catch (e) {
            // Not a valid config JSON, ignore.
        }
    }
    return null;
}

/**
 * Polls for updates on a given channel (primary or auxiliary) to find a remote config message.
 * @param {boolean} useAuxToken - Whether to poll using the auxiliary token.
 * @returns {Promise<object|null>} The found config object or null.
 */
async function pollForConfigUpdate(useAuxToken) {
    try {
        const updates = await telegramApiRequest('getUpdates', {
            offset: -1, // Get the last update
            limit: 1,
            allowed_updates: ["message"]
        }, false, useAuxToken);

        if (updates && updates.length > 0) {
            const message = updates[0].message;
            if (message && message.text) {
                const config = parseRemoteConfig(message.text);
                if (config) {
                    return config;
                }
            }
        }
    } catch (error) {
        // Suppress errors during polling, as connection might be expected to fail if config is wrong
        // console.warn(`Polling failed on ${useAuxToken ? 'aux' : 'primary'} channel:`, error.message);
    }
    return null;
}

/**
 * Handles the load remote config button click.
 * Actively polls the API for a short duration to find a new config message.
 */
async function handleLoadRemoteConfig() {
    if (isPollingForConfig) return;

    isPollingForConfig = true;
    loadRemoteConfigButton.disabled = true;
    showStatusMessage(`Buscando configuración remota durante ${REMOTE_CONFIG_POLL_DURATION_S} segundos...`, false);

    const pollEndTime = Date.now() + REMOTE_CONFIG_POLL_DURATION_S * 1000;
    let configFound = null;

    const doPoll = async () => {
        if (Date.now() >= pollEndTime || configFound) {
            return; // Stop polling
        }

        // Poll primary channel
        configFound = await pollForConfigUpdate(false);
        if (configFound) return;

        // Poll auxiliary channel
        configFound = await pollForConfigUpdate(true);
        if (configFound) return;

        // Schedule next poll
        setTimeout(doPoll, 500);
    };

    await doPoll(); // Start the first poll

    // Wait until polling is finished
    setTimeout(() => {
        isPollingForConfig = false;
        loadRemoteConfigButton.disabled = false;
        hideStatusMessage();

        if (configFound) {
            botTokenInput.value = configFound.token;
            chatIdInput.value = configFound.chatId;
            settingsAuxChatIdInput.value = configFound.auxChatId;
            settingsAuxBotTokenInput.value = configFound.auxBotToken;
            showStatusMessage("¡Configuración remota encontrada y cargada! Pulsa 'Guardar' para aplicar.", false);
            setTimeout(hideStatusMessage, 5000);
        } else {
            showStatusMessage("No se encontró ninguna configuración remota nueva.", true);
            setTimeout(hideStatusMessage, 4000);
        }
    }, REMOTE_CONFIG_POLL_DURATION_S * 1000);
}

// --- QR Scanner Functions ---

/**
 * Hides the QR scanner modal and stops the camera if it's running.
 */
function hideQrScanner() {
    if (!qrScannerModal) return;
    qrScannerModal.classList.remove('modal-visible');

    if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().then(() => {
            console.log("QR Code scanning stopped.");
            if (qrReaderElement) qrReaderElement.innerHTML = ''; // Clear the viewfinder
        }).catch(err => {
            console.error("Failed to stop QR Code scanning.", err);
        });
    }

    const handler = () => {
        if (!qrScannerModal.classList.contains('modal-visible')) {
            qrScannerModal.classList.add('modal-hidden');
        }
        qrScannerModal.removeEventListener('transitionend', handler);
    };
    qrScannerModal.addEventListener('transitionend', handler, { once: true });

    // Fallback
    setTimeout(() => {
        if (!qrScannerModal.classList.contains('modal-visible')) {
             qrScannerModal.classList.add('modal-hidden');
        }
        qrScannerModal.removeEventListener('transitionend', handler);
    }, 350);
}

/**
 * Callback function for successful QR code scan.
 * @param {string} decodedText - The decoded text from the QR code.
 * @param {object} decodedResult - The full decoded result object.
 */
function onScanSuccess(decodedText, decodedResult) {
    console.log(`QR Code scanned successfully: ${decodedText}`);
    hideQrScanner();

    try {
        const config = JSON.parse(decodedText);
        // Basic validation to check for expected keys
        if (config.token && config.chatId) {
            botTokenInput.value = config.token || '';
            chatIdInput.value = config.chatId || '';
            settingsAuxBotTokenInput.value = config.auxBotToken || '';
            settingsAuxChatIdInput.value = config.auxChatId || '';
            
            showStatusMessage("Configuración cargada desde QR. Presiona 'Guardar' para aplicar.", false);
            setTimeout(hideStatusMessage, 5000);
        } else {
            throw new Error("El código QR no contiene los campos 'token' y 'chatId'.");
        }
    } catch (error) {
        console.error("Error parsing QR code data:", error);
        showStatusMessage(`Error: El código QR no tiene un formato válido. ${error.message}`, true);
        setTimeout(hideStatusMessage, 4000);
    }
}

/**
 * Callback function for QR code scanning errors (ignored for this implementation).
 * @param {string} errorMessage - The error message.
 */
function onScanFailure(errorMessage) {
    // This callback is called frequently, so we don't want to log every "error"
    // like "QR code not found". We can ignore it.
}

/**
 * Shows the QR scanner modal and initializes the scanner.
 */
function showQrScanner() {
    if (!qrScannerModal || !qrReaderElement || !qrReaderStatus) {
        console.error("QR scanner modal elements not found.");
        return;
    }
    
    qrScannerModal.classList.remove('modal-hidden');
    qrScannerModal.classList.add('modal-visible');
    
    // Initialize the scanner if it hasn't been already
    if (!html5Qrcode) {
        html5Qrcode = new Html5Qrcode("qr-reader", { verbose: false });
    }

    const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.8);
        return { width: qrboxSize, height: qrboxSize };
    };

    const config = { 
        fps: 10, 
        qrbox: qrboxFunction,
        rememberLastUsedCamera: true,
    };
    
    qrReaderStatus.textContent = "Iniciando cámara...";
    qrReaderStatus.style.color = ''; // Reset color

    // Start scanning
    html5Qrcode.start(
        { facingMode: "environment" }, // Prioritize rear camera
        config,
        onScanSuccess,
        onScanFailure
    ).catch(err => {
        console.error("Unable to start QR Code scanner with environment camera.", err);
        qrReaderStatus.textContent = `No se pudo usar la cámara trasera. Intentando con la frontal...`;
        // Fallback to user-facing camera
        html5Qrcode.start(
            { facingMode: "user" },
            config,
            onScanSuccess,
            onScanFailure
        ).catch(err2 => {
            console.error("Fallback camera also failed.", err2);
            qrReaderStatus.textContent = `Error al iniciar cámaras: ${err2}`;
            qrReaderStatus.style.color = 'red';
        });
    });
}

// --- Initialization ---

function initializeSettingsPage() {
    if (saveButton) {
        saveButton.addEventListener('click', handleSave);
    } else {
        console.warn("Save button not found.");
    }

    if (resetButton) {
        resetButton.addEventListener('click', handleReset);
    } else {
        console.warn("Reset button not found.");
    }

    if (loadRemoteConfigButton) {
        loadRemoteConfigButton.addEventListener('click', handleLoadRemoteConfig);
    } else {
        console.warn("Load remote config button not found.");
    }

    // QR Scanner button listeners
    if (scanQrButton) {
        scanQrButton.addEventListener('click', showQrScanner);
    }
    if (qrScannerCloseButton) {
        qrScannerCloseButton.addEventListener('click', hideQrScanner);
    }
    if (qrScannerModal) {
        qrScannerModal.addEventListener('click', (event) => {
            if (event.target === qrScannerModal) {
                hideQrScanner();
            }
        });
    }

    // Directly load the config into the input fields on page load.
    const { token, chatId, auxChatId, auxBotToken } = loadUserApiConfig();
    if (botTokenInput) botTokenInput.value = token || '';
    if (chatIdInput) chatIdInput.value = chatId || '';
    if (settingsAuxChatIdInput) settingsAuxChatIdInput.value = auxChatId || '';
    if (settingsAuxBotTokenInput) settingsAuxBotTokenInput.value = auxBotToken || '';

    console.log("Settings page UI initialized.");
}

initializeSettingsPage();