// strategyEngine.js

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { log } from './logger.js';

/**
 * @class StrategyEngine
 * @description Generates pure, market-based trading signals using the Gemini AI.
 */
export class StrategyEngine {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const safetySettings = [{
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        }];
        this.model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", safetySettings }); // Using 1.5 Flash for potentially better analysis
        log.info("StrategyEngine initialized with Gemini 2.5 Flash model.");
    }

    /**
     * Constructs a pure market analysis prompt for the Gemini AI.
     * @private
     * @param {object} ohlcData - An array of OHLC candle objects.
     * @returns {string} A formatted prompt string.
     */
    _createPrompt(ohlcData) {
        const lastCandle = ohlcData[ohlcData.length - 1];

       const candleTimestamp = lastCandle.timestamp ? new Date(lastCandle.timestamp * 1000) : new Date(lastCandle.date);
        // The prompt is now PURELY focused on market data analysis.
        return `
            You are an expert trading analysis AI for the PF_XBTUSD (Bitcoin Futures) market. Your only task is to analyze the provided OHLC market data and return a trading signal in a strict JSON format. Do not consider any external factors like account balance or open positions.

            **Market Context:**
            - Asset: Bitcoin Futures (PF_XBTUSD)
            - Current Time: ${candleTimestamp.toISOString()}

            **Latest Market Data (1-Hour OHLC):**
            You have been provided with a sequence of 1-hour OHLC candles. The most recent candlestick is:
            - Open: ${lastCandle.open}
            - High: ${lastCandle.high}
            - Low: ${lastCandle.low}
            - Close: ${lastCandle.close}
            - Volume: ${lastCandle.volume}
            - Timestamp: ${candleTimestamp.toISOString()}

            **Your Task:**
            Based *only* on the provided OHLC data patterns, trends, and volume:
            1.  Decide on one of three actions: **LONG**, **SHORT**, or **HOLD**.
            2.  Provide a **confidence score** for your decision, from 0 (no confidence) to 100 (absolute certainty).
            3.  Provide a brief, one-sentence **rationale** for your decision.

            **Output Format (Strict JSON only):**
            Return ONLY a JSON object with three keys: "signal", "confidence", "reason".
        `;
    }

    /**
     * Analyzes market data and generates a trading signal.
     * @param {object} marketData - The consolidated data. We only use the 'ohlc' part.
     * @returns {Promise<object>} A promise that resolves to { signal, confidence, reason }.
     */
    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data for analysis.' };
        }

        // We only pass the OHLC data to the prompt creator.
        const prompt = this._createPrompt(marketData.ohlc);
        log.info("Generating pure market signal with confidence score from Gemini...");

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const signalData = JSON.parse(cleanedText);

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
