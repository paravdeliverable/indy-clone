import { handleXSearchScrapeData } from "../Scripts/xSearchScrapeData.js";

const xSearchScrapeDataEventHandler = async (message, sender, sendResponse) => {
    const { searchKeywords } = await chrome.storage.local.get("searchKeywords");

    if (!searchKeywords || searchKeywords.length === 0) {
        console.error("No search keywords found in storage");
        if (sendResponse) {
            sendResponse({ success: false, error: "No keywords found" });
        }
        return;
    }

    const joinedKeywords = searchKeywords.join(", ");

    // Get tab ID - prefer from message, then sender.tab, then active tab
    let tabId = message.tabId;

    if (!tabId && sender.tab) {
        tabId = sender.tab.id;
    }

    if (!tabId) {
        // Get active tab as fallback
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            tabId = tab.id;
        } else {
            console.error("No tab found");
            if (sendResponse) {
                sendResponse({ success: false, error: "No active tab found" });
            }
            return;
        }
    }

    await chrome.tabs.update(tabId, { url: `https://x.com/search?q=${joinedKeywords}&f=live` });

    chrome.tabs.onUpdated.addListener(function onTabUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onTabUpdated);
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: handleXSearchScrapeData,
            });
            if (sendResponse) {
                sendResponse({ success: true, tabId: tabId });
            }
        }
    });
};

export {
    xSearchScrapeDataEventHandler
};