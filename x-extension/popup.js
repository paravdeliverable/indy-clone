document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("keywordsForm");
    const keywordsTextarea = document.getElementById("keywords");
    const submitBtn = document.getElementById("submitBtn");
    const statusDiv = document.getElementById("status");

    // Load existing keywords from storage
    try {
        const { searchKeywords } = await chrome.storage.local.get("searchKeywords");
        if (searchKeywords && Array.isArray(searchKeywords) && searchKeywords.length > 0) {
            keywordsTextarea.value = searchKeywords.join(", ");
        }
    } catch (error) {
        console.error("Error loading keywords:", error);
    }

    // Show status message
    const showStatus = (message, type = "info") => {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        setTimeout(() => {
            statusDiv.className = "status";
        }, 5000);
    };

    // Handle form submission
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const keywordsInput = keywordsTextarea.value.trim();

        if (!keywordsInput) {
            showStatus("Please enter at least one keyword", "error");
            return;
        }

        // Parse keywords (support both comma-separated and newline-separated)
        const keywords = keywordsInput
            .split(/[,\n]/)
            .map(k => k.trim())
            .filter(k => k.length > 0);

        if (keywords.length === 0) {
            showStatus("Please enter valid keywords", "error");
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = "Processing...";

            // Store keywords in chrome.storage.local
            await chrome.storage.local.set({ searchKeywords: keywords });

            // Get the current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error("No active tab found");
            }

            // Send message to background script to trigger xSearchScrapeData
            chrome.runtime.sendMessage(
                {
                    action: "xSearchScrapeData",
                    tabId: tab.id
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        throw new Error(chrome.runtime.lastError.message);
                    }

                    showStatus(`Scraping started with ${keywords.length} keyword(s)!`, "success");
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Start Scraping";

                    // Close popup after a short delay
                    setTimeout(() => {
                        window.close();
                    }, 1500);
                }
            );
        } catch (error) {
            console.error("Error starting scrape:", error);
            showStatus(`Error: ${error.message}`, "error");
            submitBtn.disabled = false;
            submitBtn.textContent = "Start Scraping";
        }
    });
});
