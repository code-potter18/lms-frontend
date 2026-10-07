// Chat popup (AIChatBox) drag position.
//
// Kept in sessionStorage so every new browser session starts the popup back at
// its default spot, and wiped explicitly when a session ends or a new one
// begins (see utils/token.ts: remove() and saveToken()).
//
// Deliberately has no imports: token.ts depends on this module, so it must not
// depend back on anything.

export const CHAT_PANEL_POSITION_KEY = "ai-chatbox-panel-position";

export interface ChatPanelPosition {
    x: number;
    y: number;
}

export function loadChatPanelPosition(): ChatPanelPosition | null {
    try {
        const saved = sessionStorage.getItem(CHAT_PANEL_POSITION_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
                return { x: parsed.x, y: parsed.y };
            }
        }
    } catch { /* ignore */ }
    return null;
}

export function saveChatPanelPosition(pos: ChatPanelPosition): void {
    try {
        sessionStorage.setItem(CHAT_PANEL_POSITION_KEY, JSON.stringify(pos));
    } catch { /* ignore */ }
}

export function resetChatPanelPosition(): void {
    try {
        sessionStorage.removeItem(CHAT_PANEL_POSITION_KEY);
        // legacy copy written by older builds to localStorage
        localStorage.removeItem(CHAT_PANEL_POSITION_KEY);
    } catch { /* ignore */ }
}
