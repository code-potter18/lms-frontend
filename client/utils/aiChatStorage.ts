// AI chatbot (AIChatBox) persisted state: message history, the active
// conversation id, and whether the popup was left open. All of it lives in
// localStorage under user-scoped keys built from the prefixes below
// (e.g. "ai-chatbox-messages-<scope>", "ai-chatbox-open-<scope>").
//
// Nothing here may be wiped by a logout: the next login must start with a
// closed, empty chat -- for every user, in every module (admin AppLayout,
// doctor DoctorLayout, lab pages, and the axios 401 session-expiry path all
// funnel through utils/token.ts remove()/saveToken()).
//
// Deliberately has no imports: utils/token.ts depends on this module, so it
// must not depend back on anything (same rule as chatPanelPosition.ts).
export const CHAT_MESSAGES_KEY_PREFIX = "ai-chatbox-messages";
export const CHAT_OPEN_KEY_PREFIX = "ai-chatbox-open";

// Prefix shared by every key AIChatBox writes: messages, conversation id,
// open flag, and the legacy localStorage copy of the panel position.
const ALL_CHAT_KEYS_PREFIX = "ai-chatbox-";

// Fired after the stored chat has been wiped so a still-mounted AIChatBox
// closes and empties immediately instead of waiting for its unmount.
export const AI_CHAT_CLEARED_EVENT = "ai-chatbox-cleared";

export function clearAIChatStorage(): void {
    try {
        const staleKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(ALL_CHAT_KEYS_PREFIX)) staleKeys.push(key);
        }
        staleKeys.forEach((key) => localStorage.removeItem(key));
    } catch { /* ignore */ }

    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AI_CHAT_CLEARED_EVENT));
    }
}
