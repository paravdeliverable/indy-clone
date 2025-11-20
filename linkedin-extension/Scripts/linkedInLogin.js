/**
 * Handle LinkedIn login process
 */
async function handleLinkedInLogin(credential) {
    function waitForElement(selector, intervalTime) {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, intervalTime);
        });
    }

    try {
        const emailField = await waitForElement("input[type='email'], input[id*='username'], input[name='session_key']", 1000);
        const passwordField = await waitForElement("input[type='password'], input[id*='password'], input[name='session_password']", 1000);
        const submitButton = [...document.querySelectorAll("button[type='submit']")].find(
            elem => elem.innerText.toLowerCase().includes("sign in") || elem.innerText.toLowerCase().includes("log in")
        );

        if (emailField) {
            emailField.value = credential.email;
            emailField.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (submitButton) {
                submitButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (passwordField) {
            passwordField.value = credential.password;
            passwordField.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const finalSubmitButton = document.querySelector("button[type='submit']");
            if (finalSubmitButton) {
                finalSubmitButton.click();
            }
        }
    } catch (error) {
        console.error('Error during LinkedIn login:', error);
        throw error;
    }
}

export { handleLinkedInLogin };

