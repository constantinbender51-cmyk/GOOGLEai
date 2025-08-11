import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

/**
 * @class StrategyEngine
 * @description Generates trading signals by sending market data to the Gemini AI for analysis.
 */
export class StrategyEngine {
    constructor() {
        // Initialize the Gemini client. It automatically reads the GEMINI_API_KEY from process.env.
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Configuration to prevent the model from blocking financial advice-related content.
        // Use with caution and understand the risks.
        const safetySettings = [
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
            },
        ];

        this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings });
        console.log("StrategyEngine initialized with Gemini 1.5 Flash model.");
    }

    // strategyEngine.js

// ... (keep the rest of the file the same)

    /**
     * Constructs a detailed prompt for the Gemini AI based on the current market data.
     * @private
     * @param {object} marketData - The consolidated data object from the DataHandler.
     * @returns {string} A formatted prompt string.
     */
    _createPrompt(marketData) {
        const { ohlc, balance, positions, orders, fills } = marketData; // Destructure fills
        const lastCandle = ohlc[ohlc.length - 1];

        // Format the fills data cleanly for the prompt
        const recentFillsText = fills.fills?.length > 0 
            ? JSON.stringify(fills.fills.slice(0, 5), null, 2) // Show up to 5 most recent fills
            : "None";

        return `
            You are an expert trading analysis AI. Your task is to analyze the provided market data and return a trading signal in a strict JSON format.

            **Market Context:**
            - Asset: Bitcoin (XBT/USD)
            - Current Time: ${new Date().toISOString()}
            - My Current Account Balance: ${JSON.stringify(balance.accounts, null, 2)}
            - My Current Open Positions: ${JSON.stringify(positions.openPositions, null, 2) || "None"}
            - My Current Open Orders: ${JSON.stringify(orders.openOrders, null, 2) || "None"}
            - My 5 Most Recent Trades (Fills): ${recentFillsText}

            **Latest Market Data (OHLC):**
            The last candlestick shows:
            - Open: ${lastCandle.open}
            - High: ${lastCandle.high}
            - Low: ${lastCandle.low}
            - Close: ${lastCandle.close}
            - Volume: ${lastCandle.volume}
            - Timestamp: ${lastCandle.date}

            **Your Task:**
            Based on all the provided data, decide on one of three actions: LONG, SHORT, or HOLD.
            - **LONG**: If you believe the price is likely to go up.
            - **SHORT**: If you believe the price is likely to go down.
            - **HOLD**: If you see no clear opportunity or believe it's best to wait.

            Provide a brief, one-sentence rationale for your decision.

            **Output Format (Strict JSON):**
            Return ONLY a JSON object with two keys: "signal" and "reason".
            Example: {"signal": "LONG", "reason": "The price has broken a key resistance level on high volume."}
        `;
    }

// ... (rest of the file is the same)


    /**
     * Analyzes market data and generates a trading signal using the Gemini AI.
     * @param {object} marketData - The consolidated data from the DataHandler.
     * @returns {Promise<object>} A promise that resolves to an object like { signal: 'LONG'|'SHORT'|'HOLD', reason: '...' }.
     */
    async generateSignal(marketData) {
        if (!marketData || !marketData.ohlc || marketData.ohlc.length === 0) {
            console.error("StrategyEngine: Invalid or empty market data provided.");
            return { signal: 'HOLD', reason: 'Insufficient market data for analysis.' };
        }

        const prompt = this._createPrompt(marketData);
        console.log("Generating signal with Gemini...");

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            
            // Clean the response to ensure it's valid JSON
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const signalData = JSON.parse(cleanedText);

            // Validate the parsed signal
            if (!['LONG', 'SHORT', 'HOLD'].includes(signalData.signal)) {
                throw new Error(`Invalid signal received from AI: ${signalData.signal}`);
            }

            console.log(`AI Signal Received: ${signalData.signal}. Reason: ${signalData.reason}`);
            return signalData;

        } catch (error) {
            console.error("Error generating signal from Gemini:", error);
            // Default to a safe action (HOLD) if the AI fails or returns a malformed response
            return { signal: 'HOLD', reason: 'Failed to get a valid signal from the AI model.' };
        }
    }
}
