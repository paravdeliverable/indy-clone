const xEventHandler = async () => {
    const tabs = await chrome.tabs.query({});
    const xTab = tabs[0]
    if (xTab) {
        chrome.scripting.executeScript({
            target: { tabId: xTab.id },
            func: () => chrome.runtime.sendMessage({
                action: "xSearchScrapeData",
            }),
        });
    }
};

export {
    xEventHandler,
};