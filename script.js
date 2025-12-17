import { loadChatHistory, saveChatHistory } from './storage.js';
import { clearChat } from './chat-actions.js';
import { addMessageToChat, updateConnectionStatus, updateTickerDisplay, updateProductCard, saveProductData, loadAllProductData, deleteProduct, showNotification, showRouletteButton, loadProductData } from './ui.js';
import { telegramApiRequest, getMeRequest, FILE_BASE_URL, MAIN_CHAT_ID, AUX_CHAT_ID } from './telegram-api.js';

// --- Storage Keys ---
const LOCAL_STORAGE_KEY = `telegramChatHistory_${MAIN_CHAT_ID}`;
const TICKER_STORAGE_KEY = 'topPanelTickerText'; 
const MLC_CARD_STORAGE_KEY = 'mlcCardNumber'; 
const CURRENCY_STORAGE_KEY = 'selectedCurrency'; 

// State variables
let updateInterval = null;
let lastUpdateId = 0;
let botInfo = null;
let chatHistory = []; 
let currentCurrency = 'CUP'; 
let currencyToggle; 

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

async function getMe() {
    try {
        const result = await getMeRequest();
        if (!result) {
            throw new Error("La respuesta de getMe fue nula o inválida.");
        }
        console.log('Bot info:', result);
        botInfo = result;
        updateConnectionStatus(true, result); 
        return result;
    } catch (error) {
        console.error("Failed to get bot info:", error);
        updateConnectionStatus(false);
        logSystemMessage(`Fallo al obtener información del bot: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Parses the product update command from a message caption/text.
 * Expected format: *DULCES* *<id>* *<name>* *<description>* *<priceCUP> CUP <priceMLC> MLC*
 * Or with only one price: *DULCES* *<id>* *<name>* *<description>* *<price> CUP* (or MLC)
 * @param {string} text - The message caption or text.
 * @returns {object|null} An object with { id, name, description, priceCUP, priceMLC } or null if parsing fails.
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

async function getUpdates() {
    if (!updateInterval) {
        return; 
    }

    let updates = [];
    try {
        updates = await telegramApiRequest('getUpdates', {
            offset: lastUpdateId + 1,
            timeout: 50, 
            allowed_updates: ["message"] 
        });

        if (updates === null) {
            console.warn("getUpdates returned null, scheduling retry.");
            scheduleNextPoll(15000); 
            return;
        }

        if (updates.length > 0 && document.querySelector('.connection-status-display .status-indicator.disconnected')) {
             if (botInfo) updateConnectionStatus(true, botInfo);
             else await getMe(); 
        }

        for (const update of updates) {
            lastUpdateId = update.update_id;
            if (update.message) {
                const message = update.message;
                const senderName = message.from?.first_name || message.from?.username || 'Desconocido';
                const messageChatId = message.chat.id.toString();
                const messageTimestamp = message.date;

                const isFromAllowedChat = messageChatId === MAIN_CHAT_ID || (AUX_CHAT_ID && messageChatId === AUX_CHAT_ID);

                if (!isFromAllowedChat) {
                    console.log(`Ignored message from unexpected chat: ${messageChatId}. Allowed: ${MAIN_CHAT_ID}${AUX_CHAT_ID ? ' or ' + AUX_CHAT_ID : ''}`);
                    continue;
                }

                const photoArray = message.photo;
                const caption = message.caption;
                const text = message.text;

                const logCallback = (msg, type, sender) => logSystemMessage(msg, type, sender);

                if (text === '*ELIMINAR.M*') {
                    console.log("Received clear command from:", senderName);
                    chatHistory = clearChat(LOCAL_STORAGE_KEY, logCallback);
                    logCallback(`Historial eliminado por ${senderName}.`, 'system', 'Sistema'); 
                    continue;
                }

                if (text && text.startsWith('*PANEL SUPERIOR*')) {
                    const tickerText = text.substring('*PANEL SUPERIOR*'.length).trim();
                    console.log("Received ticker update command:", tickerText);
                    localStorage.setItem(TICKER_STORAGE_KEY, tickerText);
                    updateTickerDisplay(tickerText); 
                    logCallback(`Panel superior actualizado por ${senderName} a: "${tickerText}"`, 'system', 'Sistema');
                    continue;
                }

                if (text && text.startsWith('*NOTIFICACION*')) {
                    const notificationText = text.substring('*NOTIFICACION*'.length).trim();
                    if (notificationText) {
                        console.log("Received notification command:", notificationText);
                        showNotification(notificationText); 
                        logCallback(`Notificación mostrada por ${senderName}: "${notificationText}"`, 'system', 'Sistema');
                    } else {
                        console.warn("Received empty notification command from:", senderName);
                        logCallback(`Comando de notificación vacío recibido de ${senderName}.`, 'warn', 'Sistema');
                    }
                    continue; 
                }

                if (text && text.startsWith('*RULETA*')) {
                    const parts = text.split('*');
                    const trimmedParts = parts.map(part => part.trim()).filter(part => part !== '');
                    if (trimmedParts.length === 4 &&
                        trimmedParts[0].toUpperCase() === 'RULETA' &&
                        /^\d+$/.test(trimmedParts[1]) && 
                        /^\d+$/.test(trimmedParts[2]) && 
                        trimmedParts[3]) {               

                        const attempts = trimmedParts[1];
                        const winHour = parseInt(trimmedParts[2], 10); 
                        const code = trimmedParts[3];

                        if (winHour >= 0 && winHour <= 23) {
                            console.log(`Received Roulette command from ${senderName}: Attempts=${attempts}, WinHour=${winHour}, Code=${code}`);
                            showRouletteButton(attempts, winHour, code);
                            logCallback(`Botón de ruleta mostrado por ${senderName} (Intentos: ${attempts}, Hora ganadora: ${winHour}, Código: ${code}).`, 'system', 'Sistema');
                        } else {
                             console.warn(`Invalid Win Hour (${winHour}) in Roulette command from ${senderName}: ${text}`);
                             logCallback(`Hora ganadora inválida (${winHour}) en comando de ruleta recibido de ${senderName}: "${text}"`, 'warn', 'Sistema');
                        }
                    } else {
                        console.warn(`Invalid Roulette command format received from ${senderName}: ${text}`);
                        logCallback(`Formato de comando de ruleta inválido recibido de ${senderName}: "${text}"`, 'warn', 'Sistema');
                    }
                    continue; 
                }

                if (text && text.startsWith('*TARJETA*')) {
                    const potentialCardNumber = text.substring('*TARJETA*'.length).trim();
                    if (potentialCardNumber && /^[0-9\s-]+$/.test(potentialCardNumber)) {
                        localStorage.setItem(MLC_CARD_STORAGE_KEY, potentialCardNumber);
                        console.log(`Received MLC Card update command from ${senderName}. New number stored.`);
                        logCallback(`Número de tarjeta MLC actualizado por ${senderName}.`, 'system', 'Sistema');
                    } else {
                        console.warn(`Invalid MLC Card number format received from ${senderName}: ${potentialCardNumber}`);
                        logCallback(`Formato de número de tarjeta MLC inválido recibido de ${senderName}.`, 'warn', 'Sistema');
                    }
                    continue; 
                }

                if (text === '*TARJETA.E*') {
                     localStorage.removeItem(MLC_CARD_STORAGE_KEY);
                     console.log(`Received MLC Card delete command from ${senderName}. Number removed.`);
                     logCallback(`Número de tarjeta MLC eliminado por ${senderName}.`, 'system', 'Sistema');
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

                // --- Check for remote configuration message ---
                if (text && text.trim().startsWith('{')) { // Basic check for JSON
                    try {
                        const potentialConfig = JSON.parse(text);
                        // Check for the required keys
                        if (potentialConfig && typeof potentialConfig === 'object' && potentialConfig.token && potentialConfig.chatId) {
                            const remoteConfig = {
                                token: String(potentialConfig.token),
                                chatId: String(potentialConfig.chatId),
                                auxBotToken: potentialConfig.auxBotToken ? String(potentialConfig.auxBotToken) : '',
                                auxChatId: potentialConfig.auxChatId ? String(potentialConfig.auxChatId) : '',
                            };

                            console.log(`Received remote API configuration from ${senderName} on ${botType} channel.`);
                            localStorage.setItem('remoteApiConfig', JSON.stringify(remoteConfig));
                            
                            showNotification('Nueva configuración remota recibida. Ve a Ajustes para aplicarla.', 10000);
                            
                            logCallback(`Configuración remota recibida y guardada de ${senderName}.`, 'system');
                            continue; // Message processed, skip to next update
                        }
                    } catch (e) {
                        // Not a valid JSON, or doesn't match the structure. Ignore and let it be processed as a regular message.
                    }
                }
                // --- End remote configuration check ---

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
                        const fileInfo = await telegramApiRequest('getFile', { file_id: fileId });
                        if (fileInfo && fileInfo.file_path) {
                            productImageUrl = `${FILE_BASE_URL}/${fileInfo.file_path}`;
                            console.log(`Received Product Update for ID ${productUpdateData.id} with Image from ${senderName}`);
                        } else {
                            throw new Error("getFile response missing file_path");
                        }
                    } catch (fileError) {
                        console.error(`Error fetching file info for product update photo (ID: ${productUpdateData.id}):`, fileError);
                        logSystemMessage(`No se pudo obtener la URL de la imagen para la actualización del producto ID ${productUpdateData.id} (${fileError.message}).`, 'warn');
                        productImageUrl = null; 
                    }
                } else if (productUpdateData && !photoArray) {
                    console.log(`Received Text-Only Product Update for ID ${productUpdateData.id} from ${senderName}`);
                    productImageUrl = null; 
                }

                if (productUpdateData) {
                    const { id, name, description, priceCUP, priceMLC } = productUpdateData;

                    let existingImageUrl = null;
                    if (productImageUrl === null) { 
                        const existingData = loadProductData(id); 
                        if (existingData && existingData.imageUrl) {
                            existingImageUrl = existingData.imageUrl;
                            console.log(`Retaining existing image URL for product ${id}: ${existingImageUrl}`);
                        }
                    }

                    const finalProductData = {
                        name,
                        description,
                        priceCUP, 
                        priceMLC, 
                        imageUrl: productImageUrl !== null ? productImageUrl : existingImageUrl 
                    };

                    updateProductCard(id, finalProductData); 
                    saveProductData(id, finalProductData); 

                    logCallback(`Producto ID ${id} actualizado por ${senderName} a: "${name}". Precios: ${finalProductData.priceCUP !== null ? finalProductData.priceCUP + ' CUP' : ''}${finalProductData.priceMLC !== null ? (finalProductData.priceCUP !== null ? ', ' : '') + finalProductData.priceMLC + ' MLC' : ''}.`, 'system', 'Sistema');

                    continue; 
                }

                if (messageChatId === MAIN_CHAT_ID) {
                    let messageData = {
                        type: 'received',
                        sender: senderName,
                        timestamp: messageTimestamp,
                        text: null,
                        imageUrl: null,
                    };
                    let shouldSave = false; 

                    if (photoArray && photoArray.length > 0) {
                         messageData.text = caption; 
                         const bestPhoto = photoArray[photoArray.length - 1];
                         const fileId = bestPhoto.file_id;
                         try {
                             const fileInfo = await telegramApiRequest('getFile', { file_id: fileId });
                             if (fileInfo && fileInfo.file_path) {
                                 messageData.imageUrl = `${FILE_BASE_URL}/${fileInfo.file_path}`;
                                shouldSave = true; 
                                console.log(`Received Photo from ${senderName} in MAIN_CHAT_ID: ${caption || '[No caption]'}`);
                             } else {
                                 throw new Error("getFile response missing file_path");
                             }
                         } catch (fileError) {
                             console.error(`Error fetching file info for received photo (caption: ${caption || 'N/A'}):`, fileError);
                             if (caption) shouldSave = true; 
                             logSystemMessage(`No se pudo obtener la URL de la imagen recibida (${fileError.message}). Caption: ${caption || 'N/A'}`, 'warn');
                         }
                    } else if (text) {
                         messageData.text = text;
                         shouldSave = true; 
                         console.log(`Received Text from ${senderName} in MAIN_CHAT_ID: ${text}`);
                    } else if (message.new_chat_participant || message.left_chat_participant) {
                        let systemText = '';
                        if (message.new_chat_participant) systemText = `${message.new_chat_participant.first_name} se unió.`;
                        if (message.left_chat_participant) systemText = `${message.left_chat_participant.first_name} salió.`;
                        if (systemText) {
                            logSystemMessage(systemText, 'system');
                        }
                        console.log("Received chat member update (not saved to history):", message);
                    } else {
                        console.log("Ignored unsupported message type (not saved to history):", message);
                    }

                     if (shouldSave) {
                        addMessageToChat(messageData.text, messageData.type, messageData.sender, messageData.timestamp, messageData.imageUrl, true, chatHistory, LOCAL_STORAGE_KEY);
                     }
                } else {
                    console.log(`Message from chat ${messageChatId} (not MAIN_CHAT_ID) processed for commands but not saved to history.`);
                }
            } 
        } 

    } catch (error) {
        console.error('Error processing updates loop:', error);
        logSystemMessage(`Error en el bucle de actualizaciones: ${error.message}`, 'error');
        scheduleNextPoll(15000); 
        return;
    } finally {
        if (updateInterval) {
            scheduleNextPoll(100); 
        }
    }
}

function scheduleNextPoll(delay) {
    if (updateInterval) {
        if (typeof updateInterval === 'number') {
            clearTimeout(updateInterval);
        }
        updateInterval = setTimeout(getUpdates, delay);
    }
}

function startPolling() {
    if (!botInfo) {
        console.warn("Cannot start polling without Bot Info. Retrying getMe...");
        getMe().then(info => {
            if (info) {
                console.log("Bot info obtained, starting polling now.");
                startPolling(); 
            } else {
                console.error("Failed to get bot info on retry. Polling not started.");
                logSystemMessage("No se pudo iniciar la conexión con el bot. Verifica el token y la conexión.", 'error');
            }
        });
        return;
    }

    if (updateInterval !== null && updateInterval !== false) {
        console.log("Polling is already active.");
        return;
    }

    stopPolling();
    lastUpdateId = 0;
    let pollingChats = `MAIN_CHAT_ID: ${MAIN_CHAT_ID}`;
    if (AUX_CHAT_ID) {
        pollingChats += `, AUX_CHAT_ID: ${AUX_CHAT_ID}`;
    }
    console.log("Starting polling for chats:", pollingChats);
    logSystemMessage(`Conectado al(los) chat(s). Buscando mensajes...`, 'system');
    updateInterval = true; 
    getUpdates(); 
    updateConnectionStatus(true, botInfo); 
}

function stopPolling() {
    if (updateInterval) {
        console.log("Stopping polling...");
        if (typeof updateInterval === 'number') {
            clearTimeout(updateInterval);
        }
        updateInterval = null; 
    }
}

async function initializeApp() {
    console.log("Initializing app services...");

    const logCallbackForHistory = (msg, type = 'info', sender = 'Sistema') => logSystemMessage(msg, type, sender);

    chatHistory = loadChatHistory(LOCAL_STORAGE_KEY, logCallbackForHistory) || [];
    if (chatHistory.length > 0) {
        console.log(`Loaded ${chatHistory.length} messages from history (not displayed).`);
    } else {
        console.log('No chat history found or history is empty.');
    }

    const initialTickerText = localStorage.getItem(TICKER_STORAGE_KEY);
    if (initialTickerText) {
        updateTickerDisplay(initialTickerText);
    }

    logSystemMessage(`Conectando al bot...`, 'system');
    const initialBotInfo = await getMe();
    if (initialBotInfo) {
        startPolling();
    } else {
        updateConnectionStatus(false);
        logSystemMessage(`Fallo inicial al conectar con el bot. Verifica el token y la conexión`, 'error');
    }
}

window.addEventListener('beforeunload', stopPolling);

initializeApp();