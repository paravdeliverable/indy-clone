
const handleXSearchScrapeData = async () => {
    // Wait until the loading spinner is gone
    while (document.querySelector('div[aria-label="Loading"]')) {
        await new Promise(res => setTimeout(res, 1000));
    }
    const { currentScraping } = await chrome.storage.local.get("currentScraping");
    if (currentScraping === "profile") {
        await new Promise(res => setTimeout(res, 10000));
    }
    const smoothScrollToBottom = async () => {
        return new Promise((resolve) => {
            const scrollAmount = 3 * window.innerHeight;
            window.scrollBy({ top: scrollAmount, left: 0, behavior: 'smooth' });
            setTimeout(resolve, 5000);
        });
    };

    const parseXPostsFromHTML = async (htmlElement = null, excludeIds = new Set()) => {
        const root = htmlElement || document;
        const tweets = root.querySelectorAll('article[data-testid="tweet"]');
        const posts = [];
        const { searchKeywords } = await chrome.storage.local.get("searchKeywords");
        const checkKeywords = searchKeywords || [];

        tweets.forEach((tweet) => {
            try {
                let authorName = '';
                const userNameElement = tweet.querySelector('[data-testid="User-Name"]');
                if (userNameElement) {
                    const nameSpan = userNameElement.querySelector('span[dir="ltr"]');
                    if (nameSpan) {
                        authorName = nameSpan.textContent?.trim() || '';
                    } else {
                        authorName = userNameElement.textContent?.trim() || '';
                    }
                }

                let authorUsername = '';
                let authorProfileUrl = '';
                if (userNameElement) {
                    const userLinks = userNameElement.querySelectorAll('a[href^="/"]');
                    if (userLinks.length > 0) {
                        const handleLink = Array.from(userLinks).find(a => a.textContent?.trim().startsWith('@'));
                        if (handleLink) {
                            authorUsername = handleLink.getAttribute('href')?.replace('/', '') || '';
                        }
                    }
                }
                if (!authorUsername) {
                    const authorLink = tweet.querySelector('a[href^="/"]');
                    authorUsername = authorLink?.getAttribute('href')?.replace('/', '') || '';
                }
                authorProfileUrl = authorUsername ? `https://x.com/${authorUsername}` : '';

                const tweetTextElement = tweet.querySelector('[data-testid="tweetText"]');
                const text = tweetTextElement?.textContent?.trim() || '';
                const textPreview = text.substring(0, 200);

                const timeElement = tweet.querySelector('time[datetime]');
                const datetime = timeElement?.getAttribute('datetime') || '';
                const relativeTime = timeElement?.textContent?.trim() || '';

                // Check if the tweet is pinned
                const isPinned = tweet.textContent?.toLowerCase().includes('pinned') || false;

                let createdAt = '';
                if (datetime) {
                    createdAt = new Date(datetime).toISOString();
                }
                console.log("createdAt", createdAt);
                const postLink = tweet.querySelector(`a[href*="/status/"]`);
                const postUrl = postLink ? `https://x.com${postLink.getAttribute('href')}` : '';
                const postIdMatch = postUrl.match(/\/status\/(\d+)/);
                const id = postIdMatch ? postIdMatch[1] : '';

                if (excludeIds.has(id)) {
                    return;
                }

                const replyButton = tweet.querySelector('button[data-testid="reply"]');
                const repliesText = replyButton?.getAttribute('aria-label') || '';
                const comments = parseInt(repliesText.match(/(\d+)/)?.[1] || '0', 10);

                const retweetButton = tweet.querySelector('button[data-testid="retweet"]');
                const retweetsText = retweetButton?.getAttribute('aria-label') || '';
                const shares = parseInt(retweetsText.match(/(\d+)/)?.[1] || '0', 10);

                const likeButton = tweet.querySelector('button[data-testid="like"]');
                const likesText = likeButton?.getAttribute('aria-label') || '';
                const likes = parseInt(likesText.match(/(\d+)/)?.[1] || '0', 10);

                const analyticsLink = tweet.querySelector('a[href*="/analytics"]');
                const viewsText = analyticsLink?.getAttribute('aria-label') || '';
                const views = parseInt(viewsText.match(/(\d+)/)?.[1] || '0', 10);

                const keywords = [];
                checkKeywords.forEach(kw => {
                    if (
                        text.toLowerCase().includes(kw.toLowerCase()) &&
                        !keywords.some(existingKW => existingKW.toLowerCase() === kw.toLowerCase())
                    ) {
                        keywords.push(kw);
                    }
                });

                const media = [];
                const images = tweet.querySelectorAll('img[src*="pbs.twimg.com"]');
                images.forEach((img) => {
                    const src = img.getAttribute('src');
                    if (src && !src.includes('profile_images') && !src.includes('emoji')) {
                        media.push({
                            _type: 'com.linkedin.voyager.dash.common.image.ImageViewModel',
                            imageUrl: src,
                            accessibilityText: img.getAttribute('alt') || null
                        });
                    }
                });

                const links = tweet.querySelectorAll('a[href^="http"]');
                const extractedLinks = Array.from(links)
                    .map(link => link.getAttribute('href'))
                    .filter(href => href && !href.includes('x.com') && !href.includes('twitter.com'));

                const authorUrn = authorUsername ? `urn:x:member:${authorUsername}` : '';
                const entityUrn = id ? `urn:x:activity:${id}` : '';
                const trackingId = id ? btoa(id).replace(/[+/=]/g, '').substring(0, 20) : '';

                const hasMedia = media.length > 0;
                const postType = hasMedia ? 'POST' : 'TEXT';

                const companyName = '';
                const companyUrn = '';

                const language = '';
                const visibility = 'PUBLIC';

                const template = '';
                const scrapedAt = new Date().toISOString();

                const postData = {
                    authorName: authorName.split('@')[0].trim(),
                    authorProfileUrl: authorProfileUrl,
                    authorUrn: authorUrn,
                    comments: comments,
                    companyName: companyName,
                    companyUrn: companyUrn,
                    createdAt: createdAt,
                    entityUrn: entityUrn,
                    id: id,
                    isPinned: isPinned,
                    keywords: keywords,
                    language: language,
                    likes: likes,
                    media: media.length > 0 ? media : [],
                    postType: postType,
                    relativeTime: relativeTime,
                    scrapedAt: scrapedAt,
                    shares: shares,
                    template: template,
                    text: text,
                    textPreview: textPreview,
                    trackingId: trackingId,
                    updatedAt: '',
                    url: postUrl,
                    urn: entityUrn,
                    visibility: visibility,
                    views: views,
                    links: extractedLinks
                };

                posts.push(postData);
            } catch (error) {
                console.error('Error parsing tweet:', error);
            }
        });

        return posts;
    };

    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    // Get time range from storage
    const { timeRange } = await chrome.storage.local.get("timeRange");
    let timeRangeDate = null;

    if (timeRange) {
        timeRangeDate = new Date(timeRange);
    } else {
        // Default to 7 days ago if not configured
        timeRangeDate = new Date();
        timeRangeDate.setDate(timeRangeDate.getDate() - 7);
    }

    // Function to check if post is within the selected time range
    const isWithinTimeRange = (dateString) => {
        if (!dateString) return false;
        if (!timeRangeDate) return true; // If no time range set, include all posts

        const postDate = new Date(dateString);
        // Check if post date is after or equal to the configured time range date
        return postDate >= timeRangeDate;
    };

    await wait(Math.random() * 3000 + 1000);

    const seenIds = new Set([]);

    // Initialize seenIds from existing posts
    const { xPosts: existingPosts } = await chrome.storage.local.get("xPosts");
    if (existingPosts && Array.isArray(existingPosts)) {
        existingPosts.forEach(post => {
            if (post.id) {
                seenIds.add(post.id);
            }
        });
    }

    // Helper function to save a new post immediately to storage
    const savePostImmediately = async (newPost) => {
        const { xPosts: currentPosts } = await chrome.storage.local.get("xPosts");
        let allPosts = currentPosts && Array.isArray(currentPosts) ? currentPosts : [];

        // Add new post
        allPosts.push(newPost);

        // Deduplicate by id
        allPosts = allPosts.filter(
            (post, idx, arr) =>
                post.id &&
                arr.findIndex(p => p.id === post.id) === idx
        );

        // Save to storage immediately
        await chrome.storage.local.set({ xPosts: allPosts });

        return allPosts;
    };

    let foundOldPost = false;
    let totalNewPosts = 0;

    while (!foundOldPost) {
        let posts = await parseXPostsFromHTML(null, seenIds);

        let hasValidPost = false;
        for (const p of posts) {
            if (!seenIds.has(p.id) && p.id) {
                // If post is pinned, consider it as valid without checking date
                const isWithinRange = p.isPinned || isWithinTimeRange(p.createdAt);
                if (isWithinRange) {
                    seenIds.add(p.id);
                    // Save immediately to storage
                    await savePostImmediately(p);
                    totalNewPosts++;
                    hasValidPost = true;
                } else {
                    // Found a post outside the time range
                    foundOldPost = true;
                }
            }
        }

        // If no posts within time range found in this batch, stop
        if (!hasValidPost && posts.length > 0) {
            foundOldPost = true;
        }

        if (foundOldPost) break;

        await smoothScrollToBottom();
        await wait(2000 + Math.random() * 2000);
    }

    // Get final posts for the saveData message
    const { xPosts: finalPosts } = await chrome.storage.local.get("xPosts");
    const allPosts = finalPosts && Array.isArray(finalPosts) ? finalPosts : [];

    chrome.runtime.sendMessage({ action: "saveData", data: allPosts });
    await chrome.storage.local.set({ currentScraping: "profile" });
};

export { handleXSearchScrapeData };