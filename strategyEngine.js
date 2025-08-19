// strategyEngine.js

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { log } from './logger.js';

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

    _createPrompt(ohlcData) {
        const lastCandle = ohlcData[ohlcData.length - 1];
        const candleTimestamp = lastCandle.timestamp ? new Date(lastCandle.timestamp * 1000) : new Date(lastCandle.date);

        return `
            You are an expert trading analysis AI for the PF_XBTUSD (Bitcoin Futures) market. Your only task is to analyze the provided OHLC market data and return a trading signal in a strict JSON format.

            **Market Context:**
            - Asset: Bitcoin Futures (PF_XBTUSD)
            - Current Time: ${candleTimestamp.toISOString()}
            - Latest Candle Close Price: $${lastCandle.close}

            **Your Task:**
            Based *only* on the provided OHLC data patterns, trends, and volatility:
            1.  Decide on one of three actions: **LONG**, **SHORT**, or **HOLD**.
            2.  Provide a **confidence score** for your decision (0-100).
            3.  If the signal is LONG or SHORT, provide a **suggested_stop_loss_distance_in_usd**. This should be a reasonable dollar amount based on recent volatility (e.g., for a price of 60000, a distance might be 500, 800, or 1200). If the signal is HOLD, this should be 0.
            4.  Provide a brief, one-sentence **rationale**.

            **Output Format (Strict JSON only):**
            Return ONLY a JSON object with four keys: "signal", "confidence", "reason", and "stop_loss_distance_in_usd".
            The "confidence" and "stop_loss_distance_in_usd" values must be numbers.

            Example for a LONG trade:
            {"signal": "LONG", "confidence": 85, "reason": "The price has decisively broken above a key resistance level on high volume.", "stop_loss_distance_in_usd": 750}
            
            Example for a HOLD decision:
            {"signal": "HOLD", "confidence": 30, "reason": "The market is showing conflicting signals with low volume.", "stop_loss_distance_in_usd": 0}
        `;
    }

    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data.', stop_loss_distance_in_usd: 0 };
        }

        const prompt = this._createPrompt(marketData.ohlc);
        log.info("Generating signal with stop-loss suggestion from Gemini...");

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const signalData = JSON.parse(cleanedText);

            // Validate the new, more complex response
            if (!['LONG', 'SHORT', 'HOLD'].includes(signalData.signal) || typeof signalData.confidence !== 'number' || typeof signalData.stop_loss_distance_in_usd !== 'number') {
                throw new Error(`Invalid or malformed response from AI: ${JSON.stringify(signalData)}`);
            }

            log.info(`AI Signal Received: ${signalData.signal} (Confidence: ${signalData.confidence}) | Suggested SL Distance: $${signalData.stop_loss_distance_in_usd}`);
            return signalData;

        } catch (error) {
            log.error("Error generating signal from Gemini:", error);
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.', stop_loss_distance_in_usd: 0 };
        }
    }
}
