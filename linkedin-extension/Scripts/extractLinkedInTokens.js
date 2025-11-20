async function extractLinkedInCookies() {
    try {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'extractLinkedInCookies' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (response && response.success) {
                        const tokens = response.tokens;
                        console.log('✅ Extracted LinkedIn cookies');
                        resolve(tokens);
                    } else {
                        reject(new Error('Failed to extract cookies'));
                    }
                }
            );
        });
    } catch (error) {
        console.error('❌ Error extracting LinkedIn cookies:', error);
        throw error;
    }
}

/**
 * Extract CSRF token from the page
 */
async function extractCSRFToken() {
    try {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'extractLinkedInCookies' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(extractCSRFTokenFromPage());
                        return;
                    }

                    if (response && response.success && response.tokens) {
                        let csrfFromPage = extractCSRFTokenFromPage();
                        if (csrfFromPage) {
                            csrfFromPage = csrfFromPage.replace(/^["']|["']$/g, '');
                            console.log('✅ CSRF token extracted from page');
                            resolve(csrfFromPage);
                        } else {
                            resolve(null);
                        }
                    } else {
                        const fallbackCsrf = extractCSRFTokenFromPage();
                        if (fallbackCsrf) {
                            resolve(fallbackCsrf.replace(/^["']|["']$/g, ''));
                        } else {
                            resolve(null);
                        }
                    }
                }
            );
        });
    } catch (error) {
        console.error('❌ Error extracting CSRF token:', error);
        return extractCSRFTokenFromPage();
    }
}

/**
 * Extract CSRF token directly from the page DOM and scripts
 */
function extractCSRFTokenFromPage() {
    try {
        // Method 1: Try meta tags
        const csrfMeta = document.querySelector('meta[name="csrf-token"], meta[name="csrfToken"]');
        if (csrfMeta) {
            const token = csrfMeta.getAttribute('content');
            if (token) return token;
        }

        // Method 2: Try window variables
        if (window.csrfToken) return window.csrfToken;
        if (window.csrf) return window.csrf;

        // Method 3: Extract from page scripts (most reliable for LinkedIn)
        const scripts = document.querySelectorAll('script:not([src])');
        for (const script of scripts) {
            const content = script.textContent || script.innerHTML;
            if (!content) continue;

            // Look for LinkedIn CSRF token in format: ajax:4481484276809131033
            const ajaxPattern = /["']?ajax:(\d+)["']?/i;
            const ajaxMatch = content.match(ajaxPattern);
            if (ajaxMatch) {
                const token = ajaxMatch[0];
                const cleanToken = token.replace(/^["']|["']$/g, '');
                return cleanToken;
            }

            // Look for CSRF token patterns
            const patterns = [
                /csrfToken["\s:=]+["']([^"']+)["']/i,
                /csrf["\s:=]+["']([^"']+)["']/i,
                /"csrfToken":"([^"]+)"/i,
                /"csrf":"([^"]+)"/i,
            ];

            for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match && match[1] && match[1].length > 10) {
                    let token = match[1];
                    token = token.replace(/^["']|["']$/g, '');
                    if (token.startsWith('ajax:')) {
                        return token;
                    }
                    return token;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('❌ Error in extractCSRFTokenFromPage:', error);
        return null;
    }
}

/**
 * Main function to extract all LinkedIn tokens and data
 */
async function extractLinkedInTokens() {
    try {
        console.log('🔍 Starting LinkedIn token extraction...');

        if (!window.location.hostname.includes('linkedin.com')) {
            throw new Error('Not on a LinkedIn page. Please navigate to LinkedIn first.');
        }

        const cookies = await extractLinkedInCookies();

        if (!cookies.li_at) {
            throw new Error('Not logged in to LinkedIn. Please log in first.');
        }

        let csrfToken = await extractCSRFToken();
        if (csrfToken) {
            csrfToken = csrfToken.replace(/^["']|["']$/g, '');
        }

        const tokenData = {
            cookies,
            csrfToken,
            extractedAt: new Date().toISOString(),
            userAgent: navigator.userAgent
        };

        console.log('✅ Successfully extracted LinkedIn tokens');
        return tokenData;
    } catch (error) {
        console.error('❌ Error in extractLinkedInTokens:', error);
        throw error;
    }
}

/**
 * Store extracted tokens in chrome.storage.local
 */
async function storeLinkedInTokens(tokenData) {
    try {
        await chrome.storage.local.set({
            linkedInTokens: tokenData
        });
        console.log('✅ LinkedIn tokens stored');
        return true;
    } catch (error) {
        console.error('❌ Error storing LinkedIn tokens:', error);
        throw error;
    }
}

/**
 * Retrieve stored LinkedIn tokens
 */
async function getStoredLinkedInTokens() {
    try {
        const result = await chrome.storage.local.get(['linkedInTokens']);
        return result.linkedInTokens || null;
    } catch (error) {
        console.error('❌ Error retrieving LinkedIn tokens:', error);
        return null;
    }
}

export {
    extractLinkedInTokens,
    extractLinkedInCookies,
    extractCSRFToken,
    storeLinkedInTokens,
    getStoredLinkedInTokens
};

