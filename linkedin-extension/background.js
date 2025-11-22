const BACKEND_URL = 'http://localhost:8000';

let pollingInterval = null;
let isPolling = false;
let currentPollingOffset = 0;
let pollRequestInProgress = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'login') {
        loginToBackend(request.email, request.password)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'startPolling') {
        startPolling(request.keywords, request.interval, request.timeRange, request.people);
        sendResponse({ success: true });
    }

    if (request.action === 'stopPolling') {
        stopPolling();
        sendResponse({ success: true });
    }

    if (request.action === 'getPollingStatus') {
        sendResponse({
            isPolling,
            interval: pollingInterval ? request.interval : null,
            keywords: request.keywords || []
        });
    }

    if (request.action === 'getScrapedPosts') {
        getScrapedPostsFromBackend()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'clearPosts') {
        clearPostsFromBackend()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

let currentPollingKeywords = [];
let currentPollingPeople = [];
let currentTimeRange = { value: 30, unit: 'days' };

async function startPolling(keywords, intervalSeconds = 300, timeRange = null, people = []) {
    if (isPolling) {
        console.log('⚠️ Polling already in progress');
        return;
    }

    if (!keywords || keywords.length === 0) {
        console.error('❌ No keywords provided for polling');
        return;
    }

    const storageData = await new Promise((resolve) => {
        chrome.storage.local.get(['pollingOffset'], resolve);
    });

    if (storageData.pollingOffset === undefined || storageData.pollingOffset === null) {
        await new Promise((resolve) => {
            chrome.storage.local.set({ pollingOffset: 0 }, resolve);
        });
        currentPollingOffset = 0;
        console.log('📝 Initialized polling offset to 0 in storage');
    } else {
        currentPollingOffset = storageData.pollingOffset;
        console.log(`📝 Using existing polling offset from storage: ${currentPollingOffset}`);
    }

    isPolling = true;
    currentPollingKeywords = keywords;
    currentPollingPeople = people || [];
    if (timeRange) {
        currentTimeRange = timeRange;
    }
    const intervalMs = intervalSeconds * 1000;

    const minutes = Math.floor(intervalSeconds / 60);
    const seconds = intervalSeconds % 60;
    const timeStr = minutes > 0
        ? `${minutes}m ${seconds > 0 ? seconds + 's' : ''}`.trim()
        : `${intervalSeconds}s`;

    console.log(`🚀 Starting polling for keywords: ${keywords.join(', ')} every ${timeStr} (${intervalSeconds} seconds)`);
    if (currentPollingPeople.length > 0) {
        console.log(`👥 Checking ${currentPollingPeople.length} profile(s): ${currentPollingPeople.join(', ')}`);
    }
    console.log(`📅 Time range: ${currentTimeRange.value} ${currentTimeRange.unit}`);

    await pollForPosts(keywords, currentTimeRange, currentPollingPeople);

    pollingInterval = setInterval(async () => {
        console.log(`⏰ Polling interval triggered. Using keywords:`, currentPollingKeywords);
        await pollForPosts(currentPollingKeywords, currentTimeRange, currentPollingPeople);
    }, intervalMs);
}


function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    isPolling = false;
    currentPollingKeywords = [];
    currentPollingPeople = [];
    pollRequestInProgress = false;
}


async function pollForPosts(keywords, timeRange = null, people = []) {
    if (pollRequestInProgress) {
        console.log('⏸️ Poll request already in progress, skipping this request');
        return;
    }

    pollRequestInProgress = true;

    try {
        const storageData = await new Promise((resolve) => {
            chrome.storage.local.get(['pollingOffset'], resolve);
        });
        const offset = storageData.pollingOffset || 0;

        console.log(`🔍 Polling for posts with keywords: ${keywords.join(', ')} (offset: ${offset})`);
        if (people && people.length > 0) {
            console.log(`👥 Checking profiles: ${people.join(', ')}`);
        }
        if (timeRange) {
            console.log(`📅 Time range: ${timeRange.value} ${timeRange.unit}`);
        }

        const requestBody = { keywords, offset };
        if (timeRange) {
            requestBody.timeRange = timeRange;
        }
        if (people && people.length > 0) {
            requestBody.people = people;
        }

        const response = await fetch(`${BACKEND_URL}/poll_posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            const hasResults = data.all_checked_posts && data.all_checked_posts.length > 0;

            if (hasResults) {
                const newOffset = offset + 50;
                currentPollingOffset = newOffset;
                await new Promise((resolve) => {
                    chrome.storage.local.set({ pollingOffset: newOffset }, resolve);
                });
                console.log(`📄 Incremented offset from ${offset} to ${newOffset} after receiving data`);
            } else {
                currentPollingOffset = 0;
                await new Promise((resolve) => {
                    chrome.storage.local.set({ pollingOffset: 0 }, resolve);
                });
                console.log(`🔄 No results returned, resetting offset to 0`);
            }
        }

        if (data.success && data.scraped_posts && data.scraped_posts.length > 0) {
            // Send posts to API (don't remove duplicates, consider all as scraped)
            await sendPostsToAPI(data.scraped_posts);

            // Store posts (including duplicates)
            await storePostIds(data.scraped_posts);

            if (chrome.notifications && chrome.notifications.create) {
                try {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon.png',
                        title: 'LinkedIn Scraper',
                        message: `Found ${data.scraped_posts.length} new posts matching your keywords`
                    });
                } catch (notifError) {
                    console.log('Could not show notification:', notifError);
                }
            }
        } else {
            console.log('ℹ️ No new posts found matching keywords');
        }

    } catch (error) {
        console.error('❌ Error polling for posts:', error);

        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            if (chrome.notifications && chrome.notifications.create) {
                try {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon.png',
                        title: 'LinkedIn Scraper Error',
                        message: 'Backend server not running. Please start the Python server.'
                    });
                } catch (notifError) {
                    console.log('Could not show notification:', notifError);
                }
            }
        } else {
            if (chrome.notifications && chrome.notifications.create) {
                try {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icon.png',
                        title: 'LinkedIn Scraper Error',
                        message: `Error: ${error.message}`
                    });
                } catch (notifError) {
                    console.log('Could not show notification:', notifError);
                }
            }
        }
    } finally {
        pollRequestInProgress = false;
    }
}

async function loginToBackend(email, password) {
    try {
        const response = await fetch(`${BACKEND_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error logging in:', error);
        return { success: false, error: error.message };
    }
}

async function getScrapedPostsFromBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/get_scraped_posts`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.success) {
            await syncPostsToStorage(data.posts);
        }
        return data;
    } catch (error) {
        console.error('Error getting scraped posts:', error);
        return { success: false, error: error.message };
    }
}

async function syncPostsToStorage(backendPosts) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['scrapedPostIds'], (result) => {
            const existingPosts = result.scrapedPostIds || [];
            const existingIds = new Set(existingPosts.map(p => p.id));

            const newPosts = backendPosts.filter(post => !existingIds.has(post.id));

            if (newPosts.length > 0) {
                const allPosts = [...existingPosts, ...newPosts];
                chrome.storage.local.set({ scrapedPostIds: allPosts }, () => {
                    resolve();
                });
            } else {
                const updatedPosts = existingPosts.map(existing => {
                    const backendPost = backendPosts.find(bp => bp.id === existing.id);
                    return backendPost || existing;
                });
                chrome.storage.local.set({ scrapedPostIds: updatedPosts }, () => {
                    resolve();
                });
            }
        });
    });
}

async function clearPostsFromBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/clear_posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.success) {
            chrome.storage.local.set({
                scrapedPostIds: [],
                pollingOffset: 0,
                apiTotalScraped: 0
            });
            currentPollingOffset = 0;
        }
        return data;
    } catch (error) {
        console.error('Error clearing posts:', error);
        return { success: false, error: error.message };
    }
}

async function sendPostsToAPI(posts) {
    try {
        // Format posts according to API structure
        const formattedPosts = posts.map(post => ({
            id: post.id || post.urn || '',
            authorName: post.authorName || '',
            authorProfileUrl: post.authorProfileUrl || '',
            authorUrn: post.authorUrn || '',
            comments: post.comments || 0,
            likes: post.likes || 0,
            shares: post.shares || 0,
            postType: post.postType || post.template || 'standard',
            language: post.language || '',
            visibility: post.visibility || '',
            url: post.url || '',
            urn: post.urn || post.id || '',
            createdAt: post.createdAt || post.scrapedAt || new Date().toISOString(),
            updatedAt: post.updatedAt || post.createdAt || post.scrapedAt || new Date().toISOString(),
            scrapedAt: post.scrapedAt || new Date().toISOString(),
            keywords: post.keywords || [],
            text: post.text || post.textPreview || '',
            textPreview: post.textPreview || (post.text ? post.text.substring(0, 200) : ''),
            media: post.media || null
        }));

        // API endpoint for sending posts
        const API_URL = 'https://2590eb45e781.ngrok-free.app/api/v1/linkedin-post';
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

        const data = await response.json();

        // Store the total scraped count from API response
        // Check for various possible field names: totalScraped, total, count, totalScrapedProfiles
        const totalCount = data.totalScraped || data.total || data.count || data.totalScrapedProfiles || 0;
        if (totalCount > 0) {
            await new Promise((resolve) => {
                chrome.storage.local.set({ apiTotalScraped: totalCount }, resolve);
            });
            console.log(`✅ Sent ${formattedPosts.length} posts to API. Total scraped: ${totalCount}`);
        } else {
            console.log(`✅ Sent ${formattedPosts.length} posts to API`);
        }

        return { success: true, data };
    } catch (error) {
        console.error('❌ Error sending posts to API:', error);
        // Don't throw - continue even if API call fails
        return { success: false, error: error.message };
    }
}

async function storePostIds(newPostIds) {
    // Store all posts without filtering duplicates (consider all as scraped)
    return new Promise((resolve) => {
        chrome.storage.local.get(['scrapedPostIds'], (result) => {
            const existingPosts = result.scrapedPostIds || [];
            // Add all new posts without checking for duplicates
            const allPosts = [...existingPosts, ...newPostIds];
            chrome.storage.local.set({ scrapedPostIds: allPosts }, () => {
                resolve();
            });
        });
    });
}



