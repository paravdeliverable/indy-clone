import { xSearchScrapeDataEventHandler } from "../xHandlers/xSearchScrapeDataHandlers.js";

const saveData = async (message, sender, sendResponse) => {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ posts: formattedPosts })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("Error in closeWindow:", error);
  } finally {
    for (let elapsed = 0; elapsed < 120; elapsed += 2) {
      await new Promise(res => setTimeout(res, 2000));
    }
    await xSearchScrapeDataEventHandler(message, sender, sendResponse);
  }
};

const closeWindow = async () => {
  try {
    const { selectedCredential } = await chrome.storage.local.get("selectedCredential");
    await fetch(`https://collabflu.com/v1/account/delete-stop?accountId=${selectedCredential.id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });
  } catch (error) {
    console.error("Error in closeWindow:", error);
  }
  const { closeWindowCalled } = await chrome.storage.local.get("closeWindowCalled");
  if (closeWindowCalled) {
    return;
  }
  await chrome.storage.local.set({ closeWindowCalled: true });
  try {
    const window = await chrome.windows.create({
      url: "https://www.instagram.com/",
    });

    console.log("Window created:", window);

    const tabs = await chrome.tabs.query({ windowId: window.id });
    // Get the tab in the new window
    const tab = tabs[0];

    // Execute script directly without waiting for tab to load
    setInterval(() => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (windowId) => {
          chrome.runtime.sendMessage({
            action: "closeWindow",
            windowId,
          });
        },
        args: [window.id],
      });
    }, 5000);
  } catch (error) {
    console.error("Error in closeWindow:", error);
    // Execute script directly without waiting for tab to load
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (windowId) => {
        chrome.runtime.sendMessage({
          action: "closeWindow",
          windowId,
        });
      },
      args: [window.id],
    });
  }
};

async function checkAndCleanMultipleTabs(urls) {
  const tabs = await chrome.tabs.query({});

  const matchingTabs = tabs.filter(
    (tab) => tab.url && urls.some((url) => tab.url.includes(url))
  );

  if (matchingTabs.length > 1) {
    // Keep only the last tab
    const lastTab = matchingTabs[matchingTabs.length - 1];
    matchingTabs.forEach((tab) => {
      if (tab.id !== lastTab.id) {
        chrome.tabs.remove(tab.id);
      }
    });
  }
}

const closeAllTabsExceptPopup = async (sender) => {
  // Close all tabs except the popup
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (sender && sender.tab && sender.tab.id && tab.id !== sender.tab.id) {
        chrome.tabs.remove(tab.id);
      }
    });
  });
};

const checkScreenStuck = (tabId) => {
  chrome.scripting.executeScript({
    target: { tabId },
    func: (tabId) => {
      const errorElement = document.getElementById("main-frame-error");
      if (errorElement) {
        chrome.runtime.sendMessage({
          action: "screenStuck",
          tabId,
        });
        return;
      }
    },
    args: [tabId],
  });
}

const closeWindowHandler = async (message, sender, sendResponse) => {
  try {
    const { selectedCredential } = await chrome.storage.local.get("selectedCredential");
    await fetch(`https://collabflu.com/v1/account/delete-stop?accountId=${selectedCredential.id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    });
  } catch (error) {
    console.error("Error in closeWindow:", error);
  }
  const windows = await chrome.windows.getAll({ populate: true });
  const reversedWindows = windows.reverse();

  reversedWindows.forEach((window, index) => {
    setTimeout(() => {
      chrome.windows.remove(window.id);
    }, index * 1000); // 1 second delay per window
  });
};

const reloadTabHandler = async (message, sender, sendResponse) => {
  chrome.tabs.reload(message.tabId);
};

const removeTabHandler = async (message, sender, sendResponse) => {
  chrome.tabs.remove(message.tabId);
};

const screenStuckHandler = async (message, sender, sendResponse) => {
  chrome.tabs.onUpdated.addListener(async function outLookErrorListener(
    tabId,
    changeInfo
  ) {
    if (tabId === message.tabId && changeInfo.status === "complete") {
      await chrome.tabs.update(message.tabId, { active: true });
      closeWindow();
    }
  });
};

const updateTabHandler = async (message, sender, sendResponse) => {
  chrome.tabs.update(message.tabId || sender.tab.id, { url: message.url });
};

export {
  saveData,
  closeWindow,
  checkAndCleanMultipleTabs,
  closeAllTabsExceptPopup,
  checkScreenStuck,
  closeWindowHandler,
  reloadTabHandler,
  removeTabHandler,
  screenStuckHandler,
  updateTabHandler,
};
