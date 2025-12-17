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