import { loadChatHistory, saveChatHistory } from './storage.js';
import { clearChat } from './chat-actions.js';
import { addMessageToChat, updateConnectionStatus, updateTickerDisplay, updateProductCard, saveProductData, loadAllProductData, deleteProduct, showNotification, showRouletteButton, loadProductData } from './ui.js';
import { telegramApiRequest, getMeRequest, FILE_BASE_URL as PRIMARY_FILE_BASE_URL, MAIN_CHAT_ID, AUX_CHAT_ID, AUX_BOT_TOKEN as EFFECTIVE_AUX_BOT_TOKEN } from './telegram-api.js';
import { initializePullToRefresh } from './pull-to-refresh.js';

// --- Storage Keys ---
const LOCAL_STORAGE_KEY = `telegramChatHistory_${MAIN_CHAT_ID}`;
const TICKER_STORAGE_KEY = 'topPanelTickerText';
const MLC_CARD_STORAGE_KEY = 'mlcCardNumber';
// const CURRENCY_STORAGE_KEY = 'selectedCurrency'; // Not directly used in this script

// State variables for Primary Bot
let primaryUpdateInterval = null;
let lastPrimaryUpdateId = 0;
let primaryBotInfo = null;

// State variables for Auxiliary Bot
let auxiliaryUpdateInterval = null;
let lastAuxiliaryUpdateId = 0;
let auxiliaryBotInfo = null;

let chatHistory = []; // Shared chat history for MAIN_CHAT_ID messages

// --- Logging Helper ---
function logSystemMessage(message, type = 'info', sender = 'Sistema') {
    const prefix = `[${type.toUpperCase()}] ${sender}:`;
    if (type === 'error') {
        console.error(prefix, message);
    } else if (type === 'warn') {
        console.warn(prefix, message);
    } else {
        console.log(prefix, message);
    }
}

// --- API and Core Logic ---

async function getPrimaryBotMe() {
    try {
        const result = await getMeRequest(); // getMeRequest uses primary token by default
        if (!result) {
            throw new Error("Primary getMe response was null or invalid.");
        }
        console.log('Primary Bot info:', result);
        primaryBotInfo = result;
        updateConnectionStatus(true, result); // Update main UI status for primary bot
        return result;
    } catch (error) {
        console.error("Failed to get primary bot info:", error);
        updateConnectionStatus(false);
        logSystemMessage(`Fallo al obtener información del bot primario: ${error.message}`, 'error', 'Sistema (Primario)');
        return null;
    }
}

async function getAuxiliaryBotMe() {
    if (!EFFECTIVE_AUX_BOT_TOKEN) return null; // No aux token configured
    try {
        const result = await telegramApiRequest('getMe', {}, false, true); // useAuxToken = true
        if (!result) {
            throw new Error("Auxiliary getMe response was null or invalid.");
        }
        console.log('Auxiliary Bot info:', result);
        auxiliaryBotInfo = result;
        logSystemMessage(`Bot auxiliar conectado: ${result.username}`, 'info', 'Sistema (Auxiliar)');
        return result;
    } catch (error) {
        console.error("Failed to get auxiliary bot info:", error);
        logSystemMessage(`Fallo al obtener información del bot auxiliar: ${error.message}`, 'error', 'Sistema (Auxiliar)');
        return null;
    }
}


/**
 * Parses the product update command from a message caption/text.
 * (Identical to original - no changes needed here)
 */
function parseProductCommand(text) {
    if (!text || !text.startsWith('*DULCES*')) {
        return null;
    }

    const parts = text.split('*');
    const trimmedParts = parts.slice(1, -1).map(part => part.trim()).filter(part => part !== '');
    if (trimmedParts.length < 5 || trimmedParts[0].toUpperCase() !== 'DULCES') {
        console.warn("Invalid product command format (incorrect number of parts or missing DULCES keyword):", text, trimmedParts);
        return null;
    }

    const id = trimmedParts[1];
    const name = trimmedParts[2];
    const description = trimmedParts[3];
    const priceString = trimmedParts[4];

    if (!/^\d+$/.test(id)) {
        console.warn("Invalid product ID in command:", id);
        return null;
    }

    let priceCUP = null;
    let priceMLC = null;

    const priceRegex = /(\d+[,.]?\d*)\s*(CUP|MLC)/gi;
    let match;

    while ((match = priceRegex.exec(priceString)) !== null) {
        const priceValueStr = match[1].replace(',', '.');
        const priceValue = parseFloat(priceValueStr);
        const currency = match[2].toUpperCase();

        if (!isNaN(priceValue)) {
            if (currency === 'CUP') {
                priceCUP = priceValue;
            } else if (currency === 'MLC') {
                priceMLC = priceValue;
            }
        } else {
            console.warn(`Could not parse price value "${match[1]}" for currency ${currency} in command: ${text}`);
        }
    }

    if (priceCUP === null && priceMLC === null) {
        console.warn("No valid price (CUP or MLC) found in command price string:", priceString);
        return null;
    }

    return { id, name, description, priceCUP, priceMLC };
}


/**
 * Processes a batch of updates received from either primary or auxiliary polling.
 * @param {Array} updates - The array of update objects from Telegram.
 * @param {'primary' | 'auxiliary'} botType - Indicates which bot poll these updates are from.
 */
async function processUpdates(updates, botType) {
    const logPrefix = botType === 'primary' ? 'Sistema (Primario)' : 'Sistema (Auxiliar)';

    for (const update of updates) {
        // Update lastUpdateId for the respective bot type
        if (botType === 'primary') {
            lastPrimaryUpdateId = update.update_id;
        } else {
            lastAuxiliaryUpdateId = update.update_id;
        }

        if (update.message) {
            const message = update.message;
            const senderName = message.from?.first_name || message.from?.username || 'Desconocido';
            const messageChatId = message.chat.id.toString();
            const messageTimestamp = message.date;

            // --- Message Filtering based on botType and expected Chat ID ---
            if (botType === 'primary' && messageChatId !== MAIN_CHAT_ID) {
                // Primary bot should only process messages from MAIN_CHAT_ID.
                // console.log(`Primary bot: Ignored message from chat ${messageChatId} (expected ${MAIN_CHAT_ID})`);
                continue;
            }
            if (botType === 'auxiliary' && messageChatId !== AUX_CHAT_ID) {
                // Auxiliary bot should only process messages from AUX_CHAT_ID.
                // console.log(`Auxiliary bot: Ignored message from chat ${messageChatId} (expected ${AUX_CHAT_ID})`);
                continue;
            }
            // --- End Message Filtering ---

            // Determine if auxiliary token should be used for file operations for THIS message.
            // True if this message is being processed by the auxiliary bot's polling loop.
            const useAuxTokenForFileOps = (botType === 'auxiliary' && !!EFFECTIVE_AUX_BOT_TOKEN);

            const photoArray = message.photo;
            const caption = message.caption;
            const text = message.text;

            const logCallback = (msg, type, senderOverride) => logSystemMessage(msg, type, senderOverride || logPrefix);

            // --- Command Processing (Identical logic for both bots, context given by botType/logPrefix) ---
            if (text === '*ELIMINAR.M*') {
                console.log(`Received clear command from ${senderName} on ${botType} channel.`);
                chatHistory = clearChat(LOCAL_STORAGE_KEY, logCallback); // Clears shared history
                logCallback(`Historial eliminado por ${senderName}.`, 'system');
                continue;
            }

            if (text && text.startsWith('*PANEL SUPERIOR*')) {
                const tickerText = text.substring('*PANEL SUPERIOR*'.length).trim();
                console.log(`Received ticker update command from ${senderName} on ${botType} channel:`, tickerText);
                localStorage.setItem(TICKER_STORAGE_KEY, tickerText);
                updateTickerDisplay(tickerText);
                logCallback(`Panel superior actualizado por ${senderName} a: "${tickerText}"`, 'system');
                continue;
            }

            if (text && text.startsWith('*NOTIFICACION*')) {
                const notificationText = text.substring('*NOTIFICACION*'.length).trim();
                if (notificationText) {
                    console.log(`Received notification command from ${senderName} on ${botType} channel:`, notificationText);
                    showNotification(notificationText);
                    logCallback(`Notificación mostrada por ${senderName}: "${notificationText}"`, 'system');
                } else {
                    console.warn(`Received empty notification command from ${senderName} on ${botType} channel.`);
                    logCallback(`Comando de notificación vacío recibido de ${senderName}.`, 'warn');
                }
                continue;
            }

            if (text && text.startsWith('*RULETA*')) {
                const parts = text.split('*');
                const trimmedParts = parts.map(part => part.trim()).filter(part => part !== '');
                if (trimmedParts.length === 4 && trimmedParts[0].toUpperCase() === 'RULETA' &&
                    /^\d+$/.test(trimmedParts[1]) && /^\d+$/.test(trimmedParts[2]) && trimmedParts[3]) {
                    const attempts = trimmedParts[1];
                    const winHour = parseInt(trimmedParts[2], 10);
                    const code = trimmedParts[3];
                    if (winHour >= 0 && winHour <= 23) {
                        console.log(`Received Roulette command from ${senderName} on ${botType} channel: Attempts=${attempts}, WinHour=${winHour}, Code=${code}`);
                        showRouletteButton(attempts, winHour, code);
                        logCallback(`Botón de ruleta mostrado por ${senderName} (Intentos: ${attempts}, Hora ganadora: ${winHour}, Código: ${code}).`, 'system');
                    } else {
                        console.warn(`Invalid Win Hour (${winHour}) in Roulette command from ${senderName} on ${botType} channel: ${text}`);
                        logCallback(`Hora ganadora inválida (${winHour}) en comando de ruleta de ${senderName}: "${text}"`, 'warn');
                    }
                } else {
                    console.warn(`Invalid Roulette command format from ${senderName} on ${botType} channel: ${text}`);
                    logCallback(`Formato de comando de ruleta inválido de ${senderName}: "${text}"`, 'warn');
                }
                continue;
            }

            if (text && text.startsWith('*TARJETA*')) {
                const potentialCardNumber = text.substring('*TARJETA*'.length).trim();
                if (potentialCardNumber && /^[0-9\s-]+$/.test(potentialCardNumber)) {
                    localStorage.setItem(MLC_CARD_STORAGE_KEY, potentialCardNumber);
                    console.log(`Received MLC Card update from ${senderName} on ${botType} channel.`);
                    logCallback(`Número de tarjeta MLC actualizado por ${senderName}.`, 'system');
                } else {
                    console.warn(`Invalid MLC Card number format from ${senderName} on ${botType} channel: ${potentialCardNumber}`);
                    logCallback(`Formato de número de tarjeta MLC inválido de ${senderName}.`, 'warn');
                }
                continue;
            }
            if (text === '*TARJETA.E*') {
                localStorage.removeItem(MLC_CARD_STORAGE_KEY);
                console.log(`Received MLC Card delete command from ${senderName} on ${botType} channel.`);
                logCallback(`Número de tarjeta MLC eliminado por ${senderName}.`, 'system');
                continue;
            }

            if (text && text.startsWith('*ELIMINAR.PRODUCTO*')) {
                const parts = text.split('*').map(part => part.trim()).filter(part => part !== '');
                if (parts.length === 2 && parts[0].toUpperCase() === 'ELIMINAR.PRODUCTO' && /^\d+$/.test(parts[1])) {
                    const productIdToDelete = parts[1];
                    console.log(`Received Delete command for product ID ${productIdToDelete} from ${senderName} on ${botType} channel`);
                    deleteProduct(productIdToDelete);
                    logCallback(`Producto ID ${productIdToDelete} eliminado por ${senderName}.`, 'system');
                } else {
                    console.warn(`Invalid delete product command format from ${senderName} on ${botType} channel:`, text);
                    logCallback(`Comando para eliminar producto inválido de ${senderName}: "${text}"`, 'warn');
                }
                continue;
            }

            let productUpdateData = null;
            let productImageUrl = null;
            let commandTextSource = caption || text;

            if (commandTextSource) {
                productUpdateData = parseProductCommand(commandTextSource);
            }

            if (productUpdateData && photoArray && photoArray.length > 0) {
                const bestPhoto = photoArray[photoArray.length - 1];
                const fileId = bestPhoto.file_id;
                try {
                    // Use useAuxTokenForFileOps to decide which token for getFile
                    const fileInfo = await telegramApiRequest('getFile', { file_id: fileId }, false, useAuxTokenForFileOps);
                    if (fileInfo && fileInfo.file_path) {
                        let fileBase = PRIMARY_FILE_BASE_URL; // Default to primary
                        if (useAuxTokenForFileOps) { // If aux token was used for getFile
                            fileBase = `https://api.telegram.org/file/bot${EFFECTIVE_AUX_BOT_TOKEN}`;
                        }
                        productImageUrl = `${fileBase}/${fileInfo.file_path}`;
                        console.log(`Product Update ID ${productUpdateData.id} with Image from ${senderName} on ${botType} channel (using ${useAuxTokenForFileOps ? 'AUX' : 'Primary'} token path)`);
                    } else {
                        throw new Error("getFile response missing file_path");
                    }
                } catch (fileError) {
                    console.error(`Error fetching file info for product update (ID: ${productUpdateData.id}, botType: ${botType}):`, fileError);
                    logCallback(`No se pudo obtener URL de imagen para producto ID ${productUpdateData.id} (${fileError.message}).`, 'warn');
                    productImageUrl = null;
                }
            } else if (productUpdateData && !photoArray) {
                console.log(`Text-Only Product Update ID ${productUpdateData.id} from ${senderName} on ${botType} channel`);
                productImageUrl = null;
            }

            if (productUpdateData) {
                const { id, name: prodName, description, priceCUP, priceMLC } = productUpdateData;
                let existingImageUrl = null;
                if (productImageUrl === null) {
                    const existingData = loadProductData(id);
                    if (existingData && existingData.imageUrl) {
                        existingImageUrl = existingData.imageUrl;
                    }
                }
                const finalProductData = {
                    name: prodName, description, priceCUP, priceMLC,
                    imageUrl: productImageUrl !== null ? productImageUrl : existingImageUrl
                };
                updateProductCard(id, finalProductData);
                saveProductData(id, finalProductData);
                logCallback(`Producto ID ${id} actualizado por ${senderName} a: "${prodName}". Precios: ${finalProductData.priceCUP !== null ? finalProductData.priceCUP + ' CUP' : ''}${finalProductData.priceMLC !== null ? (finalProductData.priceCUP !== null ? ', ' : '') + finalProductData.priceMLC + ' MLC' : ''}.`, 'system');
                continue;
            }
            // --- End Command Processing ---

            // --- Chat Message Handling (Only for MAIN_CHAT_ID via primary bot's poll) ---
            if (botType === 'primary' && messageChatId === MAIN_CHAT_ID) {
                let messageData = { type: 'received', sender: senderName, timestamp: messageTimestamp, text: null, imageUrl: null };
                let shouldSave = false;

                if (photoArray && photoArray.length > 0) {
                    messageData.text = caption;
                    const bestPhoto = photoArray[photoArray.length - 1];
                    const fileId = bestPhoto.file_id;
                    try {
                        // Files for MAIN_CHAT_ID messages always use primary token
                        const fileInfo = await telegramApiRequest('getFile', { file_id: fileId }, false, false);
                        if (fileInfo && fileInfo.file_path) {
                            messageData.imageUrl = `${PRIMARY_FILE_BASE_URL}/${fileInfo.file_path}`;
                            shouldSave = true;
                        } else throw new Error("getFile response missing file_path for MAIN_CHAT_ID message");
                    } catch (fileError) {
                        console.error(`Error fetching file for MAIN_CHAT_ID message (caption: ${caption || 'N/A'}):`, fileError);
                        if (caption) shouldSave = true;
                        logCallback(`No se pudo obtener URL de imagen recibida (${fileError.message}). Caption: ${caption || 'N/A'}`, 'warn');
                    }
                } else if (text) {
                    messageData.text = text;
                    shouldSave = true;
                } else if (message.new_chat_participant || message.left_chat_participant) {
                    // System messages like user joined/left (not saved to history)
                }

                if (shouldSave) {
                    addMessageToChat(messageData.text, messageData.type, messageData.sender, messageData.timestamp, messageData.imageUrl, true, chatHistory, LOCAL_STORAGE_KEY);
                }
            }
            // --- End Chat Message Handling ---
        }
    }
}


async function fetchPrimaryUpdates() {
    if (!primaryUpdateInterval) return; // Polling stopped

    let updates = [];
    try {
        updates = await telegramApiRequest('getUpdates', {
            offset: lastPrimaryUpdateId + 1,
            timeout: 50,
            allowed_updates: ["message"]
        }, false, false); // useAuxToken = false for primary bot's updates

        if (updates === null) {
            console.warn("Primary getUpdates returned null, scheduling retry.");
            scheduleNextPrimaryPoll(15000);
            return;
        }

        if (updates.length > 0 && document.querySelector('.connection-status-display .status-indicator.disconnected')) {
            if (primaryBotInfo) updateConnectionStatus(true, primaryBotInfo);
            else await getPrimaryBotMe();
        }

        await processUpdates(updates, 'primary');

    } catch (error) {
        console.error('Error in primary updates loop:', error);
        logSystemMessage(`Error en bucle de actualizaciones (Primario): ${error.message}`, 'error', 'Sistema (Primario)');
        scheduleNextPrimaryPoll(15000); // Retry after delay
        return;
    } finally {
        if (primaryUpdateInterval) {
            scheduleNextPrimaryPoll(100); // Schedule next immediate poll
        }
    }
}

async function fetchAuxiliaryUpdates() {
    if (!auxiliaryUpdateInterval || !EFFECTIVE_AUX_BOT_TOKEN || !AUX_CHAT_ID) return; // Polling stopped or not configured

    let updates = [];
    try {
        updates = await telegramApiRequest('getUpdates', {
            offset: lastAuxiliaryUpdateId + 1,
            timeout: 50,
            allowed_updates: ["message"]
        }, false, true); // useAuxToken = true for auxiliary bot's updates

        if (updates === null) {
            console.warn("Auxiliary getUpdates returned null, scheduling retry.");
            scheduleNextAuxiliaryPoll(15000);
            return;
        }

        if (updates.length > 0 && !auxiliaryBotInfo) { // Check if aux bot info needs to be fetched
             await getAuxiliaryBotMe();
        }
        await processUpdates(updates, 'auxiliary');

    } catch (error) {
        console.error('Error in auxiliary updates loop:', error);
        logSystemMessage(`Error en bucle de actualizaciones (Auxiliar): ${error.message}`, 'error', 'Sistema (Auxiliar)');
        scheduleNextAuxiliaryPoll(15000); // Retry after delay
        return;
    } finally {
        if (auxiliaryUpdateInterval) {
            scheduleNextAuxiliaryPoll(100); // Schedule next immediate poll
        }
    }
}

function scheduleNextPrimaryPoll(delay) {
    if (primaryUpdateInterval) {
        if (typeof primaryUpdateInterval === 'number') clearTimeout(primaryUpdateInterval);
        primaryUpdateInterval = setTimeout(fetchPrimaryUpdates, delay);
    }
}

function scheduleNextAuxiliaryPoll(delay) {
    if (auxiliaryUpdateInterval) {
        if (typeof auxiliaryUpdateInterval === 'number') clearTimeout(auxiliaryUpdateInterval);
        auxiliaryUpdateInterval = setTimeout(fetchAuxiliaryUpdates, delay);
    }
}

function startPrimaryPolling() {
    if (!primaryBotInfo) {
        getPrimaryBotMe().then(info => {
            if (info) startPrimaryPolling();
            else console.error("Failed to get primary bot info on retry. Primary polling not started.");
        });
        return;
    }
    if (primaryUpdateInterval !== null && primaryUpdateInterval !== false) return; // Already active

    stopPrimaryPolling();
    lastPrimaryUpdateId = 0;
    logSystemMessage(`Conectado al chat principal (${MAIN_CHAT_ID}). Buscando mensajes...`, 'system', 'Sistema (Primario)');
    primaryUpdateInterval = true; // Mark as starting
    fetchPrimaryUpdates();
    updateConnectionStatus(true, primaryBotInfo);
}

function startAuxiliaryPolling() {
    if (!EFFECTIVE_AUX_BOT_TOKEN || !AUX_CHAT_ID) return; // Not configured

    if (!auxiliaryBotInfo) {
        getAuxiliaryBotMe().then(info => {
            if (info) startAuxiliaryPolling();
            else console.error("Failed to get auxiliary bot info on retry. Auxiliary polling not started.");
        });
        return;
    }
    if (auxiliaryUpdateInterval !== null && auxiliaryUpdateInterval !== false) return; // Already active

    stopAuxiliaryPolling();
    lastAuxiliaryUpdateId = 0;
    logSystemMessage(`Conectado al chat auxiliar (${AUX_CHAT_ID}). Buscando mensajes...`, 'system', 'Sistema (Auxiliar)');
    auxiliaryUpdateInterval = true; // Mark as starting
    fetchAuxiliaryUpdates();
}

function stopPrimaryPolling() {
    if (primaryUpdateInterval) {
        if (typeof primaryUpdateInterval === 'number') clearTimeout(primaryUpdateInterval);
        primaryUpdateInterval = null;
        console.log("Primary polling stopped.");
    }
}

function stopAuxiliaryPolling() {
    if (auxiliaryUpdateInterval) {
        if (typeof auxiliaryUpdateInterval === 'number') clearTimeout(auxiliaryUpdateInterval);
        auxiliaryUpdateInterval = null;
        console.log("Auxiliary polling stopped.");
    }
}

function stopAllPolling() {
    stopPrimaryPolling();
    stopAuxiliaryPolling();
}

async function initializeApp() {
    console.log("Initializing app services...");
    chatHistory = loadChatHistory(LOCAL_STORAGE_KEY, (msg, type) => logSystemMessage(msg, type, 'Storage')) || [];

    const initialTickerText = localStorage.getItem(TICKER_STORAGE_KEY);
    if (initialTickerText) updateTickerDisplay(initialTickerText);

    const ptrRefreshAction = async () => {
        console.log("Pull-to-refresh: Forcing update check...");
        if (primaryBotInfo) {
            if (primaryUpdateInterval && typeof primaryUpdateInterval === 'number') clearTimeout(primaryUpdateInterval);
            primaryUpdateInterval = true; 
            await fetchPrimaryUpdates().catch(e => console.error("PTR Primary Update Error:", e));
        } else {
            console.warn("Pull-to-refresh: Primary bot not initialized.");
        }
        if (auxiliaryBotInfo && EFFECTIVE_AUX_BOT_TOKEN && AUX_CHAT_ID) {
            if (auxiliaryUpdateInterval && typeof auxiliaryUpdateInterval === 'number') clearTimeout(auxiliaryUpdateInterval);
            auxiliaryUpdateInterval = true;
            await fetchAuxiliaryUpdates().catch(e => console.error("PTR Auxiliary Update Error:", e));
        } else if (EFFECTIVE_AUX_BOT_TOKEN && AUX_CHAT_ID) {
            console.warn("Pull-to-refresh: Auxiliary bot not initialized.");
        }
    };
    initializePullToRefresh(ptrRefreshAction);

    logSystemMessage(`Conectando al bot primario...`, 'system', 'Sistema (Primario)');
    const initialPrimaryInfo = await getPrimaryBotMe();
    if (initialPrimaryInfo) {
        startPrimaryPolling();
    } else {
        updateConnectionStatus(false); // Ensure UI shows disconnected if primary fails
        logSystemMessage(`Fallo inicial al conectar con el bot primario.`, 'error', 'Sistema (Primario)');
    }

    if (EFFECTIVE_AUX_BOT_TOKEN && AUX_CHAT_ID) {
        logSystemMessage(`Conectando al bot auxiliar...`, 'system', 'Sistema (Auxiliar)');
        const initialAuxInfo = await getAuxiliaryBotMe();
        if (initialAuxInfo) {
            startAuxiliaryPolling();
        } else {
            logSystemMessage(`Fallo inicial al conectar con el bot auxiliar.`, 'error', 'Sistema (Auxiliar)');
        }
    }
}

window.addEventListener('beforeunload', stopAllPolling);

initializeApp();