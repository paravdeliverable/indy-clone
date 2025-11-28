const handleXSearchScrapeData = async () => {
    const okInterval = setInterval(() => {
        const dialogBoxes = document.querySelectorAll("div[role='dialog']");
        if (dialogBoxes.length > 0) {
            [...dialogBoxes].forEach((dialog) => {
                const buttons = dialog.querySelectorAll("button[tabIndex='0']");
                if (buttons.length > 0) {
                    const okButton = [...buttons].find((button) => button.innerText.toLowerCase() === "ok");
                    if (okButton) {
                        okButton.click();
                        clearInterval(okInterval);
                    }
                }
            });
        }
    }, 3000);

    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const waitForCondition = async (conditionFn, interval = 1000, maxTries = 4) => {
        let tries = 0;
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (conditionFn()) {
                    clearInterval(checkInterval);
                    resolve(conditionFn());
                } else if (++tries >= maxTries) {
                    clearInterval(checkInterval);
                    reject(new Error("Condition not met in time"));
                }
            }, interval);
        });
    };

    await wait(Math.random() * 3000 + 1000);

    let likeButton;

    likeButton = await waitForCondition(() => {
        const btn = document.querySelector('button[aria-label="React Like"]');
        return btn || false;
    }, 1000, 4);

    console.log(likeButton, 'likeButton');

    if (!likeButton) {
        await chrome.runtime.sendMessage({ action: "completeOperation", status: "FAILED" });
        return;
    } else {
        likeButton.click();
        await wait(Math.random() * 3000 + 1000);
        await chrome.runtime.sendMessage({ action: "completeOperation", status: "COMPLETED" });
    }
};

export { handleXSearchScrapeData };