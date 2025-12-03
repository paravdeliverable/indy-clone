document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("keywordsForm");
    const keywordsTextarea = document.getElementById("keywords");
    const submitBtn = document.getElementById("submitBtn");
    const statusDiv = document.getElementById("status");

    const profilesForm = document.getElementById("profilesForm");
    const profilesTextarea = document.getElementById("profiles");
    const saveProfilesBtn = document.getElementById("saveProfilesBtn");
    const profilesStatusDiv = document.getElementById("profilesStatus");

    try {
        const { searchKeywords } = await chrome.storage.local.get("searchKeywords");
        if (searchKeywords && Array.isArray(searchKeywords) && searchKeywords.length > 0) {
            keywordsTextarea.value = searchKeywords.join(", ");
        }
    } catch (error) {
        console.error("Error loading keywords:", error);
    }

    const timeRangeInput = document.getElementById("timeRange");

    // Set max to current date/time to prevent selecting future dates
    const now = new Date();
    const maxYear = now.getFullYear();
    const maxMonth = String(now.getMonth() + 1).padStart(2, '0');
    const maxDay = String(now.getDate()).padStart(2, '0');
    const maxHours = String(now.getHours()).padStart(2, '0');
    const maxMinutes = String(now.getMinutes()).padStart(2, '0');
    timeRangeInput.max = `${maxYear}-${maxMonth}-${maxDay}T${maxHours}:${maxMinutes}`;

    try {
        const { timeRange } = await chrome.storage.local.get("timeRange");
        if (timeRange) {
            // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
            const date = new Date(timeRange);
            // Ensure the saved date is not in the future
            const savedDate = date > now ? now : date;
            const year = savedDate.getFullYear();
            const month = String(savedDate.getMonth() + 1).padStart(2, '0');
            const day = String(savedDate.getDate()).padStart(2, '0');
            const hours = String(savedDate.getHours()).padStart(2, '0');
            const minutes = String(savedDate.getMinutes()).padStart(2, '0');
            timeRangeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else {
            // Default to 7 days ago
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() - 7);
            const year = defaultDate.getFullYear();
            const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
            const day = String(defaultDate.getDate()).padStart(2, '0');
            const hours = String(defaultDate.getHours()).padStart(2, '0');
            const minutes = String(defaultDate.getMinutes()).padStart(2, '0');
            timeRangeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
    } catch (error) {
        console.error("Error loading time range:", error);
    }

    try {
        const { xProfiles } = await chrome.storage.local.get("xProfiles");
        if (xProfiles && Array.isArray(xProfiles) && xProfiles.length > 0) {
            const profileUrls = xProfiles.map(p => {
                if (typeof p === 'string') {
                    return p;
                }
                return p.url || '';
            }).filter(url => url.length > 0);
            profilesTextarea.value = profileUrls.join("\n");
        }
    } catch (error) {
        console.error("Error loading profiles:", error);
    }

    const showStatus = (message, type = "info") => {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        setTimeout(() => {
            statusDiv.className = "status";
        }, 5000);
    };

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const keywordsInput = keywordsTextarea.value.trim();

        if (!keywordsInput) {
            showStatus("Please enter at least one keyword", "error");
            return;
        }

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

            // Save time range configuration
            const timeRangeValue = timeRangeInput.value;
            if (timeRangeValue) {
                const timeRangeDate = new Date(timeRangeValue);
                const now = new Date();

                // Ensure the selected date is not in the future
                if (timeRangeDate > now) {
                    showStatus("Selected date cannot be in the future", "error");
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Start Scraping";
                    return;
                }

                await chrome.storage.local.set({ timeRange: timeRangeDate.toISOString() });
            }

            await chrome.storage.local.set({ searchKeywords: keywords });

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error("No active tab found");
            }

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
        } finally {
            await chrome.storage.local.set({ currentScraping: "search" });
        }
    });

    const showProfilesStatus = (message, type = "info") => {
        profilesStatusDiv.textContent = message;
        profilesStatusDiv.className = `status ${type}`;
        setTimeout(() => {
            profilesStatusDiv.className = "status";
        }, 5000);
    };

    profilesForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const profilesInput = profilesTextarea.value.trim();

        if (!profilesInput) {
            showProfilesStatus("Please enter at least one profile link", "error");
            return;
        }

        const profiles = profilesInput
            .split(/\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => {
                let url = '';
                if (p.startsWith("http://") || p.startsWith("https://")) {
                    url = p;
                } else if (p.startsWith("@")) {
                    url = `https://x.com/${p.substring(1)}`;
                } else if (p.startsWith("x.com/") || p.startsWith("twitter.com/")) {
                    url = `https://${p}`;
                } else {
                    url = `https://x.com/${p}`;
                }
                return {
                    url: url,
                    isScrapped: false
                };
            });

        if (profiles.length === 0) {
            showProfilesStatus("Please enter valid profile links", "error");
            return;
        }

        try {
            saveProfilesBtn.disabled = true;
            saveProfilesBtn.textContent = "Saving...";

            await chrome.storage.local.set({ xProfiles: profiles });

            showProfilesStatus(`Saved ${profiles.length} profile(s)!`, "success");
            saveProfilesBtn.disabled = false;
            saveProfilesBtn.textContent = "Save Profiles";
        } catch (error) {
            console.error("Error saving profiles:", error);
            showProfilesStatus(`Error: ${error.message}`, "error");
            saveProfilesBtn.disabled = false;
            saveProfilesBtn.textContent = "Save Profiles";
        }
    });
});
