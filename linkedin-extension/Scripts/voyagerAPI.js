/**
 * Voyager API Helper
 * Utilities for making authenticated requests to LinkedIn's Voyager API
 */

import { getStoredLinkedInTokens, storeLinkedInTokens } from './extractLinkedInTokens.js';

/**
 * Get stored LinkedIn tokens or extract them from current session
 */
async function getLinkedInTokens() {
    try {
        let tokens = await getStoredLinkedInTokens();

        if (!tokens || !tokens.cookies || !tokens.cookies.li_at) {
            console.log('No stored tokens found, attempting to extract from current session...');

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];

            if (tab && tab.url && tab.url.includes('linkedin.com')) {
                try {
                    const extractionResults = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: async () => {
                            const module = await import(chrome.runtime.getURL('Scripts/extractLinkedInTokens.js'));
                            return await module.extractLinkedInTokens();
                        }
                    });

                    if (extractionResults && extractionResults[0] && extractionResults[0].result) {
                        tokens = extractionResults[0].result;
                        await storeLinkedInTokens(tokens);
                    }
                } catch (scriptError) {
                    console.error('Error executing extraction script:', scriptError);
                }
            }
        }

        if (!tokens || !tokens.cookies || !tokens.cookies.li_at) {
            throw new Error('No LinkedIn tokens available. Please log in to LinkedIn first.');
        }

        return tokens;
    } catch (error) {
        console.error('Error getting LinkedIn tokens:', error);
        throw error;
    }
}

/**
 * Make an authenticated request to LinkedIn Voyager API
 */
async function voyagerAPIRequest(endpoint, options = {}) {
    try {
        const tokens = await getLinkedInTokens();

        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `https://www.linkedin.com${path}`;

        const headers = {
            'Accept': 'application/vnd.linkedin.normalized+json+2.1',
            'Content-Type': 'application/json',
            'Cookie': tokens.cookies.cookieString,
            'User-Agent': tokens.userAgent || navigator.userAgent,
            'X-Li-Lang': 'en_US',
            'X-Li-Page-Instance': 'urn:li:page:d_flagship3_feed;' + Date.now(),
            ...(options.headers || {})
        };

        if (tokens.csrfToken) {
            headers['Csrf-Token'] = tokens.csrfToken;
        }

        const requestOptions = {
            method: options.method || 'GET',
            headers,
            credentials: 'include',
            ...options
        };

        if (options.body) {
            if (typeof options.body === 'object') {
                requestOptions.body = JSON.stringify(options.body);
            } else {
                requestOptions.body = options.body;
            }
        }

        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Voyager API error (${response.status}):`, errorText);
            throw new Error(`Voyager API request failed: ${response.status} ${response.statusText}`);
        }

        return response;
    } catch (error) {
        console.error('❌ Error in voyagerAPIRequest:', error);
        throw error;
    }
}

/**
 * Get feed posts
 */
async function getFeedPosts(params = {}) {
    try {
        const { count = 20, start = 0 } = params;

        const queryParams = new URLSearchParams({
            count: count.toString(),
            start: start.toString(),
            q: 'all'
        });

        const response = await voyagerAPIRequest(`/voyager/api/feed/updates?${queryParams}`, {
            method: 'GET'
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error getting feed posts:', error);
        throw error;
    }
}

export {
    voyagerAPIRequest,
    getFeedPosts,
    getLinkedInTokens
};

