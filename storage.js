// --- Storage Functions ---

const ORDER_COUNT_STORAGE_PREFIX = 'customerOrderCount_';
const USER_BOT_TOKEN_KEY = 'userBotToken';
const USER_CHAT_ID_KEY = 'userChatId';
const USER_AUX_CHAT_ID_KEY = 'userAuxChatId'; 
const USER_AUX_BOT_TOKEN_KEY = 'userAuxBotToken'; 

/**
 * Loads chat history from localStorage.
 * @param {string} key - The localStorage key.
 * @param {function} logCallback - Function to log system messages (e.g., console.log).
 * @returns {Array} The loaded chat history array or an empty array on error/no data.
 */
export function loadChatHistory(key, logCallback) {
    try {
        const storedHistory = localStorage.getItem(key);
        if (storedHistory) {
            const history = JSON.parse(storedHistory);
            // Basic validation: ensure it's an array
            if (Array.isArray(history)) {
                console.log(`Loaded ${history.length} messages from history.`);
                return history;
            } else {
                 throw new Error("Stored data is not an array.");
            }
        }
    } catch (error) {
        console.error("Error loading chat history from localStorage:", error);
        localStorage.removeItem(key); // Clear corrupted data
        if (logCallback) {
            logCallback(`Error al cargar el historial (datos inválidos: ${error.message}). Se ha limpiado.`, 'error', 'Sistema');
        }
    }
    return []; // Return empty array if nothing is stored or on error
}

/**
 * Saves chat history to localStorage.
 * @param {string} key - The localStorage key.
 * @param {Array} history - The chat history array to save.
 * @param {function} logCallback - Function to log system messages (e.g., console.log).
 */
export function saveChatHistory(key, history, logCallback) {
    // Ensure history is an array before attempting to save
    if (!Array.isArray(history)) {
        console.error("Attempted to save non-array data as chat history.");
        if (logCallback) {
            logCallback("Error interno: Se intentó guardar datos inválidos como historial.", 'error', 'Sistema');
        }
        return;
    }

    try {
        // Optional: Limit the number of messages stored to prevent localStorage overflow
        const maxStoredMessages = 200; // Store last 200 messages
        let historyToSave = history;
        if (history.length > maxStoredMessages) {
            historyToSave = history.slice(history.length - maxStoredMessages);
            console.log(`History trimmed to ${maxStoredMessages} messages before saving.`);
        }
        localStorage.setItem(key, JSON.stringify(historyToSave));
    } catch (error) {
        console.error("Error saving chat history to localStorage:", error);
        // Handle potential storage full errors (e.g., QUOTA_EXCEEDED_ERR)
        if ((error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') && logCallback) {
            logCallback("Error: No se pudo guardar el historial, almacenamiento lleno.", 'error', 'Sistema');
        } else if (logCallback) {
            logCallback(`Error desconocido al guardar historial: ${error.message}`, 'error', 'Sistema');
        }
    }
}

/**
 * Loads the order count for a specific customer mobile number.
 * @param {string} mobileNumber - The customer's mobile number.
 * @returns {number} The order count, or 0 if not found or invalid.
 */
export function loadCustomerOrderCount(mobileNumber) {
    if (!mobileNumber || typeof mobileNumber !== 'string') return 0; // Ensure input is a string
    const key = `${ORDER_COUNT_STORAGE_PREFIX}${mobileNumber}`;
    try {
        const storedCount = localStorage.getItem(key);
        if (storedCount !== null) { // Check if item exists
            const count = parseInt(storedCount, 10);
            // Return count if valid, otherwise 0
            return !isNaN(count) && count >= 0 ? count : 0;
        }
    } catch (error) {
        console.error(`Error reading order count for ${mobileNumber}:`, error);
    }
    return 0; // Default to 0 if not found or error
}

/**
 * Saves the order count for a specific customer mobile number.
 * @param {string} mobileNumber - The customer's mobile number.
 * @param {number} count - The new order count.
 */
export function saveCustomerOrderCount(mobileNumber, count) {
     if (!mobileNumber || typeof mobileNumber !== 'string' || typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        console.error(`Invalid data for saving order count:`, { mobileNumber, count });
        return;
    }
    const key = `${ORDER_COUNT_STORAGE_PREFIX}${mobileNumber}`;
    try {
        localStorage.setItem(key, count.toString());
    } catch (error) {
        console.error(`Error saving order count for ${mobileNumber}:`, error);
        // Consider notifying user or logging to a service if storage consistently fails
    }
}

/**
 * Saves the user-defined Bot Token, Chat ID, Auxiliary Chat ID, and Auxiliary Bot Token to localStorage.
 * @param {string} token - The Bot Token.
 * @param {string} chatId - The Chat ID.
 * @param {string} auxChatId - The Auxiliary Chat ID (can be empty string).
 * @param {string} auxBotToken - The Auxiliary Bot Token (can be empty string).
 */
export function saveUserApiConfig(token, chatId, auxChatId, auxBotToken) {
    try {
        localStorage.setItem(USER_BOT_TOKEN_KEY, token);
        localStorage.setItem(USER_CHAT_ID_KEY, chatId);
        if (typeof auxChatId === 'string') {
            localStorage.setItem(USER_AUX_CHAT_ID_KEY, auxChatId);
        } else {
            localStorage.removeItem(USER_AUX_CHAT_ID_KEY);
        }
        if (typeof auxBotToken === 'string') { 
            localStorage.setItem(USER_AUX_BOT_TOKEN_KEY, auxBotToken);
        } else {
            localStorage.removeItem(USER_AUX_BOT_TOKEN_KEY);
        }
        console.log("User API config saved to localStorage.");
    } catch (error) {
        console.error("Error saving user API config to localStorage:", error);
    }
}

/**
 * Loads the user-defined Bot Token, Chat ID, Auxiliary Chat ID, and Auxiliary Bot Token from localStorage.
 * @returns {{token: string|null, chatId: string|null, auxChatId: string|null, auxBotToken: string|null}} An object containing the tokens and chatIds, or null if not found.
 */
export function loadUserApiConfig() {
    try {
        const token = localStorage.getItem(USER_BOT_TOKEN_KEY);
        const chatId = localStorage.getItem(USER_CHAT_ID_KEY);
        const auxChatId = localStorage.getItem(USER_AUX_CHAT_ID_KEY);
        const auxBotToken = localStorage.getItem(USER_AUX_BOT_TOKEN_KEY); 
        return { token, chatId, auxChatId, auxBotToken };
    } catch (error) {
        console.error("Error loading user API config from localStorage:", error);
        return { token: null, chatId: null, auxChatId: null, auxBotToken: null };
    }
}

/**
 * Clears the user-defined Bot Token, Chat ID, Auxiliary Chat ID, and Auxiliary Bot Token from localStorage.
 */
export function clearUserApiConfig() {
    try {
        localStorage.removeItem(USER_BOT_TOKEN_KEY);
        localStorage.removeItem(USER_CHAT_ID_KEY);
        localStorage.removeItem(USER_AUX_CHAT_ID_KEY);
        localStorage.removeItem(USER_AUX_BOT_TOKEN_KEY); 
        console.log("User API config cleared from localStorage.");
    } catch (error) {
        console.error("Error clearing user API config from localStorage:", error);
    }
}