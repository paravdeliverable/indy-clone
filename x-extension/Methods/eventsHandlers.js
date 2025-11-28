import {
    xEventHandler
} from "../events.js";
import { closeWindow } from "./commonHandlers.js";


const checkForEvents = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        xEventHandler();
    } catch (error) {
        console.error('Error fetching or processing events:', error);
        closeWindow();
    }
};

export { checkForEvents };