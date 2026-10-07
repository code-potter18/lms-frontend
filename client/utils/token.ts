// Auth session is per-tab (sessionStorage) by default so that logging into
// a different account in another tab/window never bleeds into an already
// open tab — localStorage is shared across every tab of the same origin,
// which was causing every open "branch admin" session to collapse onto
// whichever account most recently logged in anywhere in the browser.
// "Remember me" is the only case that opts into the shared, persistent
// localStorage behavior.
import { resetChatPanelPosition } from "@/utils/chatPanelPosition";
import { clearAIChatStorage } from "@/utils/aiChatStorage";

const TOKEN_KEY = "token";
const USER_KEY = "user";

export const saveToken = (token: string, rememberMe = false) => {
  // A fresh session is starting: put the chat popup back on its default spot
  // even if the previous session never logged out cleanly (e.g. a logout path
  // that only calls localStorage.clear(), which never touched sessionStorage).
  resetChatPanelPosition();
  // ...and start from a closed, empty chat so history from a previous session
  // (clean logout or not) can never leak into this one. saveToken() only runs
  // at login, so this can never wipe an in-progress conversation.
  clearAIChatStorage();
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
};

export const getToken = () => {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
};

export const saveUser = (user: any, rememberMe = false) => {
  const value = JSON.stringify(user);
  if (rememberMe) {
    localStorage.setItem(USER_KEY, value);
    sessionStorage.removeItem(USER_KEY);
  } else {
    sessionStorage.setItem(USER_KEY, value);
    localStorage.removeItem(USER_KEY);
  }
};

export const getUser = () => {
  const user = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
};

export const remove = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Session over: forget where the chat popup was dragged so the next session
  // opens it back at its original position.
  resetChatPanelPosition();
  // Session over: wipe the chat history and close the popup so the next login
  // starts with a clean, closed chat. Every logout path (admin AppLayout,
  // doctor DoctorLayout, sidebar, lab pages) and the axios 401 session-expiry
  // handler funnel through remove(), so one call covers all users/modules.
  clearAIChatStorage();
};
