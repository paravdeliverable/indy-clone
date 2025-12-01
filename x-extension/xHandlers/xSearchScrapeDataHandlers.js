import { handleXSearchScrapeData } from "../Scripts/xSearchScrapeData.js";

const xSearchScrapeDataEventHandler = async (message, sender, sendResponse) => {
    const { searchKeywords, currentScraping, xProfiles } = await chrome.storage.local.get(["searchKeywords", "currentScraping", "xProfiles"]);

    if (!searchKeywords || searchKeywords.length === 0) {
        console.error("No search keywords found in storage");
        if (sendResponse) {
            sendResponse({ success: false, error: "No keywords found" });
        }
        return;
    }

    const joinedKeywords = searchKeywords.map((keyword, idx) => {
        const quoted = `"${keyword}"`;
        return idx < searchKeywords.length - 1 ? `${quoted} OR` : quoted;
    }).join(" ");

    let tabId = message.tabId;

    if (!tabId && sender.tab) {
        tabId = sender.tab.id;
    }

    if (!tabId) {
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
    if (currentScraping === "search") {
        await chrome.tabs.update(tabId, { url: `https://x.com/search?q=${joinedKeywords}&src=typed_query&f=live` });
    } else {
        const profileToCheck = xProfiles.find(p => !p.isScrapped);
        if (profileToCheck) {
            // Set isScrapped to true for this profile
            const updatedProfiles = xProfiles.map(p =>
                p === profileToCheck ? { ...p, isScrapped: true } : p
            );
            await chrome.storage.local.set({ xProfiles: updatedProfiles });
            await chrome.tabs.update(tabId, { url: profileToCheck.url });
        } else {
            console.error("No profile to check");
            const newProfiles = xProfiles.map(p => ({ ...p, isScrapped: false }));
            await chrome.storage.local.set({ currentScraping: "search", xProfiles: newProfiles });
            await chrome.tabs.update(tabId, { url: `https://x.com/search?q=${joinedKeywords}&src=typed_query&f=live` });
        }
    }

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