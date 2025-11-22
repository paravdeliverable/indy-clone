const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const keywordsInput = document.getElementById('keywords');
const peopleInput = document.getElementById('people');
const pollIntervalInput = document.getElementById('pollInterval');
const timeRangeValueInput = document.getElementById('timeRangeValue');
const timeRangeUnitSelect = document.getElementById('timeRangeUnit');
const startPollingBtn = document.getElementById('startPollingBtn');
const stopPollingBtn = document.getElementById('stopPollingBtn');
const statusMessage = document.getElementById('statusMessage');
const keywordTags = document.getElementById('keywordTags');
const peopleTags = document.getElementById('peopleTags');
const totalPostsEl = document.getElementById('totalPosts');
const pollingStatusEl = document.getElementById('pollingStatus');
const viewPostsBtn = document.getElementById('viewPostsBtn');
const clearPostsBtn = document.getElementById('clearPostsBtn');

let keywords = [];
let people = [];

function loadSavedValues() {
    chrome.storage.local.get([
        'scrapingKeywords',
        'scrapingPeople',
        'savedEmail',
        'savedPollInterval',
        'savedTimeRangeValue',
        'savedTimeRangeUnit',
        'pollingOffset'
    ], (result) => {
        if (result.scrapingKeywords && Array.isArray(result.scrapingKeywords)) {
            keywords = result.scrapingKeywords;
            updateKeywordTags();
        } else {
            keywords = [];
            updateKeywordTags();
        }

        if (result.scrapingPeople && Array.isArray(result.scrapingPeople)) {
            people = result.scrapingPeople;
            updatePeopleTags();
        } else {
            people = [];
            updatePeopleTags();
        }

        if (result.savedEmail) {
            emailInput.value = result.savedEmail;
        }

        if (result.savedPollInterval) {
            pollIntervalInput.value = result.savedPollInterval;
        }

        if (result.savedTimeRangeValue) {
            timeRangeValueInput.value = result.savedTimeRangeValue;
        }

        if (result.savedTimeRangeUnit) {
            timeRangeUnitSelect.value = result.savedTimeRangeUnit;
        }
    });
}

function saveInputValues() {
    const valuesToSave = {
        scrapingKeywords: keywords,
        scrapingPeople: people,
        savedEmail: emailInput.value.trim(),
        savedPollInterval: pollIntervalInput.value,
        savedTimeRangeValue: timeRangeValueInput.value,
        savedTimeRangeUnit: timeRangeUnitSelect.value
    };

    chrome.storage.local.set(valuesToSave);
}

loadSavedValues();

function cleanupDuplicates() {
    chrome.storage.local.get(['scrapedPostIds'], (result) => {
        const posts = result.scrapedPostIds || [];
        if (posts.length === 0) return;

        const seen = new Map();
        const uniquePosts = [];

        posts.forEach(post => {
            const postId = post.id || post;
            if (!seen.has(postId)) {
                seen.set(postId, true);
                uniquePosts.push(post);
            }
        });

        if (uniquePosts.length !== posts.length) {
            chrome.storage.local.set({ scrapedPostIds: uniquePosts });
        }
    });
}

cleanupDuplicates();

loadStats();
updatePollingStatus();

keywordsInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addKeyword();
    }
});

peopleInput.addEventListener('blur', () => {
    addPeople();
});

peopleInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        addPeople();
    }
});

const addKeywordBtn = document.getElementById('addKeywordBtn');
if (addKeywordBtn) {
    addKeywordBtn.addEventListener('click', addKeyword);
}

function addKeyword() {
    const inputValue = keywordsInput.value.trim();
    if (!inputValue) {
        showStatus('Please enter a keyword', 'error');
        return;
    }

    const newKeywords = inputValue.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

    if (newKeywords.length === 0) {
        showStatus('Please enter a valid keyword', 'error');
        return;
    }

    saveInputValues();

    let addedCount = 0;
    let skippedCount = 0;

    newKeywords.forEach(keyword => {
        if (keywords.includes(keyword)) {
            skippedCount++;
        } else {
            keywords.push(keyword);
            addedCount++;
        }
    });

    keywordsInput.value = '';
    updateKeywordTags();
    saveInputValues();

    if (addedCount > 0) {
        showStatus(`✅ Added ${addedCount} keyword(s)${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`, 'success');
    } else {
        showStatus('All keywords already added', 'info');
    }

}

function updateKeywordTags() {
    if (keywords.length === 0) {
        keywordTags.innerHTML = '<small style="color: #999; font-style: italic;">No keywords added yet</small>';
        return;
    }

    keywordTags.innerHTML = keywords.map((keyword, index) =>
        `<span class="keyword-tag">${keyword} <span class="remove" data-index="${index}">×</span></span>`
    ).join('');

    keywordTags.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const removed = keywords.splice(index, 1)[0];
            updateKeywordTags();
            saveInputValues();
            showStatus(`Removed keyword: ${removed}`, 'info');
        });
    });
}

function addPeople() {
    const inputValue = peopleInput.value.trim();
    if (!inputValue) {
        return;
    }

    // Split by newlines or commas
    const newPeople = inputValue
        .split(/[\n,]+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    if (newPeople.length === 0) {
        return;
    }

    let addedCount = 0;
    let skippedCount = 0;

    newPeople.forEach(person => {
        if (people.includes(person)) {
            skippedCount++;
        } else {
            people.push(person);
            addedCount++;
        }
    });

    peopleInput.value = '';
    updatePeopleTags();
    saveInputValues();

    if (addedCount > 0) {
        showStatus(`✅ Added ${addedCount} person(s)${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`, 'success');
    } else if (skippedCount > 0) {
        showStatus('All people already added', 'info');
    }
}

function updatePeopleTags() {
    if (people.length === 0) {
        peopleTags.innerHTML = '<small style="color: #999; font-style: italic;">No people added yet</small>';
        return;
    }

    peopleTags.innerHTML = people.map((person, index) =>
        `<span class="keyword-tag">${person} <span class="remove" data-index="${index}" data-type="person">×</span></span>`
    ).join('');

    peopleTags.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const removed = people.splice(index, 1)[0];
            updatePeopleTags();
            saveInputValues();
            showStatus(`Removed person: ${removed}`, 'info');
        });
    });
}


emailInput.addEventListener('blur', () => {
    saveInputValues();
});

pollIntervalInput.addEventListener('change', () => {
    saveInputValues();
});

timeRangeValueInput.addEventListener('change', () => {
    saveInputValues();
});

timeRangeUnitSelect.addEventListener('change', () => {
    saveInputValues();
});

loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showStatus('Please enter email and password', 'error');
        return;
    }

    saveInputValues();

    loginBtn.disabled = true;
    showStatus('Logging in to LinkedIn via backend...', 'info');

    try {
        chrome.runtime.sendMessage({
            action: 'login',
            email: email,
            password: password
        }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                loginBtn.disabled = false;
                return;
            }

            if (response && response.success) {
                showStatus(`✅ Login successful! Welcome ${response.profile?.name || email}`, 'success');
                passwordInput.value = '';
            } else {
                showStatus('Login failed: ' + (response?.error || 'Unknown error'), 'error');
            }
            loginBtn.disabled = false;
        });
    } catch (error) {
        console.error('Login error:', error);
        showStatus('Error during login: ' + error.message, 'error');
        loginBtn.disabled = false;
    }
});

startPollingBtn.addEventListener('click', async () => {

    if (!keywords || keywords.length === 0) {
        showStatus('Please add at least one keyword (press Enter after typing)', 'error');
        console.error('No keywords found!');
        return;
    }

    const interval = parseInt(pollIntervalInput.value) || 300;
    if (interval < 10 || interval > 3600) {
        showStatus('Polling interval must be between 10 and 3600 seconds', 'error');
        return;
    }

    const timeRangeValue = parseInt(timeRangeValueInput.value) || 30;
    const timeRangeUnit = timeRangeUnitSelect.value || 'days';

    if (timeRangeValue < 1) {
        showStatus('Time range value must be at least 1', 'error');
        return;
    }

    saveInputValues();

    startPollingBtn.disabled = true;
    showStatus('Starting polling...', 'info');

    try {
        chrome.runtime.sendMessage({
            action: 'startPolling',
            keywords: keywords,
            people: people || [],
            interval: interval,
            timeRange: {
                value: timeRangeValue,
                unit: timeRangeUnit
            }
        }, (response) => {
            if (response && response.success) {
                const minutes = Math.floor(interval / 60);
                const seconds = interval % 60;
                const timeStr = minutes > 0
                    ? `${minutes}m ${seconds > 0 ? seconds + 's' : ''}`.trim()
                    : `${interval}s`;
                showStatus(`✅ Polling started! Checking every ${timeStr}.`, 'success');
                updatePollingStatus();
            } else {
                showStatus('Failed to start polling', 'error');
            }
            startPollingBtn.disabled = false;
        });
    } catch (error) {
        console.error('Error starting polling:', error);
        showStatus('Error: ' + error.message, 'error');
        startPollingBtn.disabled = false;
    }
});

stopPollingBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopPolling' }, (response) => {
        if (response && response.success) {
            showStatus('Polling stopped', 'info');
            updatePollingStatus();
        }
    });
});

// Commented out - showing API count instead of scraped posts
/*
viewPostsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'getScrapedPosts' }, (response) => {
        if (chrome.runtime.lastError) {
            showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
            return;
        }

        if (response && response.success) {
            const posts = response.posts || [];
        if (posts.length === 0) {
            showStatus('No posts scraped yet', 'info');
            return;
        }

            const overlay = document.createElement('div');
            overlay.id = 'postsModalOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const displayDiv = document.createElement('div');
            displayDiv.id = 'postsDisplayModal';
            displayDiv.style.cssText = `
                position: relative;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                max-width: 900px;
                width: 95%;
                max-height: 90vh;
                overflow: hidden;
                z-index: 10000;
                display: flex;
                flex-direction: column;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                padding: 20px 24px;
                background: linear-gradient(135deg, #0077b5 0%, #004182 100%);
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            `;

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 20px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            `;
            closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255,255,255,0.3)';
            closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255,255,255,0.2)';

            header.innerHTML = `<h3 style="margin:0; font-size:20px; font-weight:600;">📊 Scraped Posts (${posts.length})</h3>`;
            header.appendChild(closeBtn);

            const content = document.createElement('div');
            content.style.cssText = `
                padding: 24px;
                overflow-y: auto;
                flex: 1;
            `;

            const formatDate = (dateStr) => {
                if (!dateStr) return 'N/A';
                try {
                    const date = new Date(dateStr);
                    return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } catch {
                    return dateStr;
                }
            };

            posts.forEach((post, index) => {
                const postCard = document.createElement('div');
                postCard.style.cssText = `
                    background: #f8f9fa;
                    border-radius: 8px;
                    padding: 20px;
                    border: 1px solid #e0e0e0;
                    margin-bottom: 20px;
                `;

                let html = `
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                        <div style="flex: 1;">
                            ${post.authorName ? `
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                    <div style="
                                        width: 40px;
                                        height: 40px;
                                        border-radius: 50%;
                                        background: linear-gradient(135deg, #0077b5, #004182);
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        color: white;
                                        font-weight: bold;
                                        font-size: 16px;
                                    ">${post.authorName.charAt(0).toUpperCase()}</div>
                                    <div>
                                        <div style="font-weight: 600; font-size: 16px; color: #333;">
                                            ${post.authorName}
                                            ${post.authorProfileUrl ? `<a href="${post.authorProfileUrl}" target="_blank" style="color: #0077b5; text-decoration: none; margin-left: 8px; font-size: 12px;">🔗</a>` : ''}
                                        </div>
                                        ${post.companyName ? `<div style="font-size: 13px; color: #666; margin-top: 2px;">${post.companyName}</div>` : ''}
                                    </div>
                                </div>
                            ` : ''}
                            ${post.keywords && post.keywords.length > 0 ? `
                                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                                    ${post.keywords.map(k => `<span style="background: #0077b5; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;">${k}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                        <div style="text-align: right; font-size: 12px; color: #666;">
                            ${post.relativeTime ? `<div style="margin-bottom: 4px;">⏰ ${post.relativeTime.replace(/•/g, '').trim()}</div>` : ''}
                            ${post.createdAt ? `<div>📅 ${formatDate(post.createdAt)}</div>` : ''}
                        </div>
                    </div>

                    <div style="
                        background: white;
                        border-radius: 6px;
                        padding: 16px;
                        margin-bottom: 16px;
                        border-left: 4px solid #0077b5;
                        max-height: 400px;
                        overflow-y: auto;
                    ">
                        <div style="
                            font-size: 14px;
                            line-height: 1.7;
                            color: #333;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                        ">${(post.text || post.textPreview || 'No text available').replace(/\n/g, '<br>')}</div>
                    </div>

                  

                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding-top: 12px;
                        border-top: 1px solid #e0e0e0;
                        flex-wrap: wrap;
                        gap: 10px;
                    ">
                        <div style="font-size: 11px; color: #999;">
                            ⏰ Scraped: ${formatDate(post.scrapedAt)}
                        </div>
                        ${post.url ? `
                            <a href="${post.url}" target="_blank" style="
                                color: #0077b5;
                                text-decoration: none;
                                font-size: 13px;
                                font-weight: 500;
                                padding: 6px 12px;
                                border: 1px solid #0077b5;
                                border-radius: 4px;
                                transition: all 0.2s;
                            " onmouseover="this.style.background='#0077b5'; this.style.color='white';" onmouseout="this.style.background='transparent'; this.style.color='#0077b5';">
                                🔗 View on LinkedIn →
                            </a>
                        ` : ''}
                    </div>
                `;

                postCard.innerHTML = html;
                content.appendChild(postCard);
            });

            displayDiv.appendChild(header);
            displayDiv.appendChild(content);
            overlay.appendChild(displayDiv);

            document.body.appendChild(overlay);

            const handleEscape = (e) => {
                if (e.key === 'Escape' && document.getElementById('postsDisplayModal')) {
                    closeModal();
                }
            };

            const closeModal = () => {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal();
                }
            });

            document.addEventListener('keydown', handleEscape);
            closeBtn.addEventListener('click', closeModal);
        } else {
            showStatus('Error fetching posts: ' + (response?.error || 'Unknown error'), 'error');
        }
    });
});
*/

clearPostsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all scraped posts?')) {
        chrome.runtime.sendMessage({ action: 'clearPosts' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                return;
            }

            if (response && response.success) {
                showStatus('All posts cleared', 'info');
                loadStats();
            } else {
                showStatus('Error clearing posts: ' + (response?.error || 'Unknown error'), 'error');
            }
        });
    }
});

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.classList.remove('hidden');

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    }
}

function loadStats() {
    // Show API total scraped count instead of local scraped posts
    chrome.storage.local.get(['apiTotalScraped'], (result) => {
        const totalScraped = result.apiTotalScraped || 0;
        totalPostsEl.textContent = totalScraped;
    });
}

function updatePollingStatus() {
    chrome.runtime.sendMessage({ action: 'getPollingStatus' }, (response) => {
        if (response && response.isPolling) {
            pollingStatusEl.textContent = 'Active';
            pollingStatusEl.style.color = '#28a745';
        } else {
            pollingStatusEl.textContent = 'Stopped';
            pollingStatusEl.style.color = '#dc3545';
        }
    });
}

let statsInterval = null;

function startStatsUpdates() {
    if (statsInterval) {
        clearInterval(statsInterval);
    }
    loadStats();
    updatePollingStatus();
    statsInterval = setInterval(() => {
        loadStats();
        updatePollingStatus();
    }, 10000);
}

function stopStatsUpdates() {
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
}

startStatsUpdates();

window.addEventListener('beforeunload', () => {
    stopStatsUpdates();
});

