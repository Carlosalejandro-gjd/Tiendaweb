// --- Telegram API Communication Module ---
import { loadUserApiConfig } from './storage.js'; // Import function to load user config

// Default values (original hardcoded values)
const DEFAULT_BOT_TOKEN = '8120603580:AAEu183hlL44clQUccBSgy7a64IaPDiyqR4';
const DEFAULT_CHAT_ID = '908553770';

// Effective configuration variables
let effectiveBotToken;
let effectiveMainChatId;
let effectiveAuxChatId;
let effectiveAuxBotToken; // New variable for auxiliary bot token

// URLs that will be constructed dynamically (based on the primary bot token)
let API_BASE_URL_DYNAMIC;
let FILE_BASE_URL_DYNAMIC;

/**
 * Initializes the API configuration by loading user settings or using defaults.
 * This function is called once when the module is loaded.
 */
function initializeApiConfig() {
    const userConfig = loadUserApiConfig();

    effectiveBotToken = userConfig.token || DEFAULT_BOT_TOKEN;
    effectiveMainChatId = userConfig.chatId || DEFAULT_CHAT_ID;
    effectiveAuxChatId = userConfig.auxChatId || null;
    effectiveAuxBotToken = userConfig.auxBotToken || null; // Load auxiliary bot token

    // Construct URLs based on the *primary* effective token
    API_BASE_URL_DYNAMIC = `https://api.telegram.org/bot${effectiveBotToken}`;
    FILE_BASE_URL_DYNAMIC = `https://api.telegram.org/file/bot${effectiveBotToken}`;

    console.log("Telegram API Configuration Initialized:");
    console.log(`Using Bot Token: ${effectiveBotToken === DEFAULT_BOT_TOKEN ? 'Default' : 'User-defined'}`);
    console.log(`Using Main Chat ID: ${effectiveMainChatId === DEFAULT_CHAT_ID ? 'Default' : 'User-defined'}`);
    if (effectiveAuxChatId) {
        console.log(`Using Auxiliary Chat ID: ${effectiveAuxChatId} (User-defined)`);
    } else {
        console.log("Auxiliary Chat ID: Not set by user.");
    }
    if (effectiveAuxBotToken) {
        console.log(`Using Auxiliary Bot Token: User-defined`);
    } else {
        console.log("Auxiliary Bot Token: Not set by user.");
    }
}

// Initialize the configuration when the module loads
initializeApiConfig();

// Export the dynamically constructed FILE_BASE_URL (based on primary token)
export const FILE_BASE_URL = FILE_BASE_URL_DYNAMIC;

// Export the effective main and auxiliary chat IDs
export const MAIN_CHAT_ID = effectiveMainChatId;
export const AUX_CHAT_ID = effectiveAuxChatId;
export const AUX_BOT_TOKEN = effectiveAuxBotToken; // Export effectiveAuxBotToken


/**
 * Makes a request to the Telegram Bot API.
 * @param {string} method - The API method name (e.g., 'getUpdates', 'sendMessage').
 * @param {object | FormData} params - Parameters for the API method.
 * @param {boolean} isFormData - Whether the parameters are FormData (for file uploads).
 * @param {boolean} useAuxToken - If true, attempts to use the auxiliary bot token and chat ID.
 * @returns {Promise<any>} The 'result' part of the Telegram API response.
 * @throws {Error} If the request fails or the API returns an error.
 */
export async function telegramApiRequest(method, params = {}, isFormData = false, useAuxToken = false) {
    let currentBotToken = effectiveBotToken;
    let baseUrl = API_BASE_URL_DYNAMIC; // Default to primary bot's API base URL

    if (useAuxToken && effectiveAuxBotToken) {
        currentBotToken = effectiveAuxBotToken;
        baseUrl = `https://api.telegram.org/bot${effectiveAuxBotToken}`;
        // console.log(`telegramApiRequest: Using AUX token for method ${method}`); // Keep for debugging if needed
    } else if (useAuxToken && !effectiveAuxBotToken) {
        console.warn(`telegramApiRequest: Attempted to use AUX token for method ${method}, but AUX token is not configured. Falling back to primary token.`);
        // currentBotToken and baseUrl remain as primary token's
    }

    const url = `${baseUrl}/${method}`;
    const requestOptions = {
        method: 'POST',
    };

    if (isFormData) {
        requestOptions.body = params;
    } else {
        requestOptions.headers = { 'Content-Type': 'application/json' };
        requestOptions.body = JSON.stringify(params);
    }

    try {
        const response = await fetch(url, requestOptions);
        let responseData;
        const contentType = response.headers.get("content-type");

        if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
        } else {
            const textResponse = await response.text();
            if (response.ok) {
                try {
                    responseData = JSON.parse(textResponse);
                } catch (parseError) {
                    console.warn(`Received non-JSON success response from ${method}: ${textResponse.substring(0, 100)}...`);
                    throw new Error(`API method ${method} returned unexpected non-JSON content.`);
                }
            } else {
                console.error(`Telegram API Error (${method}) - Non-JSON response:`, textResponse.substring(0, 500));
                throw new Error(`HTTP error! status: ${response.status}, message: ${textResponse || response.statusText}`);
            }
        }

        if (!responseData.ok) {
            console.error(`Telegram API Error (${method}) - Response not OK:`, responseData);
            const description = responseData.description || 'Unknown API error';
            const errorCode = responseData.error_code ? ` (Code: ${responseData.error_code})` : '';
            throw new Error(`Telegram API error: ${description}${errorCode}`);
        }
        return responseData.result;

    } catch (error) {
        console.error(`Error during Telegram API request (${method}):`, error);
        if (error instanceof Error && !error.message.includes(`(${method})`) && !error.message.includes('Telegram API error')) {
           error.message = `Network or parsing error in Telegram API request (${method}): ${error.message}`;
        }
        throw error;
    }
}

/**
 * Specifically calls the getMe method using the primary bot token.
 * @returns {Promise<any>} Bot information object or throws on failure.
 */
export async function getMeRequest() {
    return await telegramApiRequest('getMe'); // Always uses primary token for 'getMe'
}

/**
 * Sends a text message to the MAIN_CHAT_ID via Telegram using the primary bot token.
 * @param {string} text - The message text to send.
 * @param {string|null} parseMode - Optional parse mode ('MarkdownV2', 'HTML', 'Markdown').
 * @returns {Promise<any>} The result of the sendMessage API call.
 * @throws {Error} If sending fails.
 */
export async function sendTelegramMessage(text, parseMode = null) {
    console.log(`Sending message to Telegram chat ${MAIN_CHAT_ID}`);
    const params = {
        chat_id: MAIN_CHAT_ID,
        text: text,
    };
    if (parseMode && ['MarkdownV2', 'HTML', 'Markdown'].includes(parseMode)) {
        params.parse_mode = parseMode;
    }
    // This will use the primary token by default as useAuxToken is false
    const result = await telegramApiRequest('sendMessage', params, false, false);
    console.log("Telegram message sent successfully to MAIN_CHAT_ID.");
    return result;
}

/**
 * Sends a text message to the AUX_CHAT_ID via Telegram using the auxiliary bot token.
 * @param {string} text - The message text to send.
 * @param {string|null} parseMode - Optional parse mode ('MarkdownV2', 'HTML', 'Markdown').
 * @returns {Promise<any>} The result of the sendMessage API call.
 * @throws {Error} If sending fails or if AUX_CHAT_ID/AUX_BOT_TOKEN is not configured.
 */
export async function sendTelegramMessageToAux(text, parseMode = null) {
    if (!effectiveAuxChatId || !effectiveAuxBotToken) {
        const errorMessage = "Cannot send to AUX chat: AUX_CHAT_ID or AUX_BOT_TOKEN not configured.";
        console.warn(errorMessage);
        throw new Error(errorMessage);
    }
    console.log(`Sending message to AUX Telegram chat ${effectiveAuxChatId} using AUX token.`);
    const params = {
        chat_id: effectiveAuxChatId,
        text: text,
    };
    if (parseMode && ['MarkdownV2', 'HTML', 'Markdown'].includes(parseMode)) {
        params.parse_mode = parseMode;
    }
    // Call telegramApiRequest ensuring it uses the aux token.
    // The last parameter of telegramApiRequest is useAuxToken.
    const result = await telegramApiRequest('sendMessage', params, false, true); // true for useAuxToken
    console.log("Telegram message sent successfully to AUX_CHAT_ID.");
    return result;
}