import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { log } from './logger.js'; // Using our logger

/**
 * @class StrategyEngine
 * @description Generates trading signals with confidence scores using the Gemini AI.
 */
export class StrategyEngine {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const safetySettings = [{
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        }];
        this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings });
        log.info("StrategyEngine initialized with Gemini 1.5 Flash model.");
    }

    /**
     * Constructs a detailed prompt for the Gemini AI, requesting a nuanced output.
     * @private
     * @param {object} marketData - The consolidated data object from the DataHandler.
     * @returns {string} A formatted prompt string.
     */
    _createPrompt(marketData) {
        const { ohlc, balance, positions, orders, fills } = marketData;
        const lastCandle = ohlc[ohlc.length - 1];
        const recentFillsText = fills.fills?.length > 0 
            ? JSON.stringify(fills.fills.slice(0, 5), null, 2)
            : "None";

        // The prompt is re-engineered for a more sophisticated response.
        return `
            You are an expert trading analysis AI for the PF_XBTUSD (Bitcoin Futures) market. Your task is to analyze the provided market data and return a trading signal in a strict JSON format.

            **Market Context:**
            - Asset: Bitcoin Futures (PF_XBTUSD)
            - Current Time: ${new Date().toISOString()}
            - My Current Tradable Balance (USD): $${balance}
            - My Current Open Positions: ${JSON.stringify(positions.openPositions, null, 2) || "None"}
            - My Current Open Orders: ${JSON.stringify(orders.openOrders, null, 2) || "None"}
            - My 5 Most Recent Trades (Fills): ${recentFillsText}

            **Latest Market Data (1-Hour OHLC):**
            The last candlestick shows:
            - Open: ${lastCandle.open}, High: ${lastCandle.high}, Low: ${lastCandle.low}, Close: ${lastCandle.close}
            - Volume: ${lastCandle.volume}
            - Timestamp: ${lastCandle.date}

            **Your Task:**
            1.  Decide on one of three actions: **LONG**, **SHORT**, or **HOLD**.
            2.  Provide a **confidence score** for your decision, from 0 (no confidence) to 100 (absolute certainty). 
                - A score of 75+ indicates a high-conviction trade setup.
                - A score of 50-74 indicates a moderate setup.
                - A score below 50 indicates low conviction, and you should likely recommend HOLD.
            3.  Provide a brief, one-sentence **rationale** for your decision.

            **Output Format (Strict JSON only):**
            Return ONLY a JSON object with three keys: "signal", "confidence", and "reason".
            The "confidence" value must be a number.

            Example for a high-conviction long trade:
            {"signal": "LONG", "confidence": 85, "reason": "The price has decisively broken above a key resistance level on high volume, suggesting strong upward momentum."}
            
            Example for a hold decision:
            {"signal": "HOLD", "confidence": 30, "reason": "The market is showing conflicting signals with low volume, indicating indecision."}
        `;
    }

    /**
     * Analyzes market data and generates a trading signal with confidence.
     * @param {object} marketData - The consolidated data from the DataHandler.
     * @returns {Promise<object>} A promise that resolves to { signal, confidence, reason }.
     */
    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty market data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data for analysis.' };
        }

        const prompt = this._createPrompt(marketData);
        log.info("Generating signal with confidence score from Gemini...");

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const signalData = JSON.parse(cleanedText);

            // Validate the more complex response
            if (!['LONG', 'SHORT', 'HOLD'].includes(signalData.signal) || typeof signalData.confidence !== 'number') {
                throw new Error(`Invalid or malformed response from AI: ${JSON.stringify(signalData)}`);
            }

            log.info(`AI Signal Received: ${signalData.signal} (Confidence: ${signalData.confidence}) | Reason: ${signalData.reason}`);
            return signalData;

        } catch (error) {
            log.error("Error generating signal from Gemini:", error);
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.' };
        }
    }
}
