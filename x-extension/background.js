import {
  runtimeMessageHandler,
} from "./Methods/listeners.js";

chrome.runtime.onMessage.addListener(runtimeMessageHandler);

console.log('X (Twitter) Extension loaded');