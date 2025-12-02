import { closeWindowHandler, reloadTabHandler, removeTabHandler, screenStuckHandler, updateTabHandler } from "./commonHandlers.js";
import { xSearchScrapeDataEventHandler } from "../xHandlers/xSearchScrapeDataHandlers.js";
import { saveData } from "./commonHandlers.js";

async function runtimeMessageHandler(message, sender, sendResponse) {
  console.log("Received message:", message);

  switch (message.action) {

    case "xSearchScrapeData":
      xSearchScrapeDataEventHandler(message, sender, sendResponse);
      break;

    case "reloadTab":
      reloadTabHandler(message, sender, sendResponse);
      break;

    case "removeTab":
      removeTabHandler(message, sender, sendResponse);
      break;

    case "updateTab":
      updateTabHandler(message, sender, sendResponse);
      break;

    case "closeWindow":
      closeWindowHandler(sender, sendResponse);
      break;

    case "screenStuck":
      screenStuckHandler(message, sender, sendResponse);
      break;

    case "saveData":
      saveData(message, sender, sendResponse);
      break;

  }

  return true;
}

export { runtimeMessageHandler };
