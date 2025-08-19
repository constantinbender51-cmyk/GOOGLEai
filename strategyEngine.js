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
        this.model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", safetySettings });
        log.info("StrategyEngine initialized with Hybrid Quantitative Prompt.");
    }

    _createPrompt(ohlcData) {
        const lastCandle = ohlcData[ohlcData.length - 1];
        const candleTimestamp = lastCandle.timestamp ? new Date(lastCandle.timestamp * 1000) : new Date(lastCandle.date);

        return `
            You are an expert quantitative strategist for the PF_XBTUSD (Bitcoin Futures) market.
            Your ONLY job is to produce a single JSON object based on the provided market data and a strict set of internal rules.

            **Internal Analysis Rules (Perform these calculations internally):**
            1.  Analyze the last 720 1-hour OHLC candles.
            2.  Calculate a composite score from -1 (strong bearish) to +1 (strong bullish) by synthesizing at least the following indicators:
                • 50-EMA and 200-EMA crossover status.
                • RSI(14) current value and its 3-candle slope.
                • MACD(12,26,9) histogram direction.
                • A custom volume-weighted price change indicator for recent buying/selling pressure.
            3.  Use a 20-period ATR to assess current volatility.

            **Your Task (Produce the final JSON based on your internal analysis):**
            1.  **"signal"**: Based on your composite score, determine the action. If score ≥ 0.3, use "LONG". If score ≤ -0.3, use "SHORT". Otherwise, use "HOLD".
            2.  **"confidence"**: Convert your composite score to a confidence value from 0 to 100. (e.g., a score of 0.42 becomes a confidence of 42, a score of -0.5 becomes 50).
            3.  **"stop_loss_distance_in_usd"**: If the signal is LONG or SHORT, provide a logical stop-loss distance in USD based on your internal ATR calculation. If the signal is HOLD, this must be 0.
            4.  **"reason"**: Provide a brief, one-sentence rationale for your decision, mentioning the composite score.

            **Output Format (Strict JSON only, no extra text or explanations):**
            Return ONLY a JSON object with the four keys: "signal", "confidence", "reason", and "stop_loss_distance_in_usd".

            Example for a LONG signal:
            {"signal":"LONG","confidence":42,"reason":"Composite score of 0.42 indicates a bullish setup.","stop_loss_distance_in_usd":850}

            Example for a HOLD signal:
            {"signal":"HOLD","confidence":15,"reason":"Composite score of 0.15 is not strong enough to signal a trade.","stop_loss_distance_in_usd":0}
        `;
    }

    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data.', stop_loss_distance_in_usd: 0 };
        }

        const prompt = this._createPrompt(marketData.ohlc);
        log.info("Generating signal with Hybrid Quantitative prompt...");

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            
            log.info(`[GEMINI_RAW_RESPONSE] Raw text from AI: \n---\n${responseText}\n---`);

            // Use the robust regex parser to find the JSON object
            const jsonMatch = responseText.match(/\{.*\}/s);
            if (!jsonMatch) {
                throw new Error("No valid JSON object found in the AI's response.");
            }
            const jsonText = jsonMatch[0];
            const signalData = JSON.parse(jsonText);

            // --- NO ADAPTATION NEEDED ---
            // The AI's output is now in the exact format our bot requires.
            // We just need to validate it.
            if (!['LONG', 'SHORT', 'HOLD'].includes(signalData.signal) || typeof signalData.confidence !== 'number' || typeof signalData.stop_loss_distance_in_usd !== 'number') {
                throw new Error(`Invalid or malformed response from AI: ${JSON.stringify(signalData)}`);
            }

            log.info(`AI Signal Received: ${signalData.signal} (Confidence: ${signalData.confidence}) | Reason: ${signalData.reason} | Suggested SL: $${signalData.stop_loss_distance_in_usd}`);
            return signalData;

        } catch (error) {
            log.error(`Error parsing signal from Hybrid prompt. The problematic text was: "${responseText}"`, error);
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.', stop_loss_distance_in_usd: 0 };
        }
    }
}
