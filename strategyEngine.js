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
        log.info("StrategyEngine initialized with Quantitative Strategist prompt.");
    }

    /**
     * Creates the new, highly-structured quantitative prompt.
     * @private
     * @param {object} ohlcData - An array of OHLC candle objects.
     * @returns {string} A formatted prompt string.
     */
    _createPrompt(ohlcData) {
        // The AI prompt specifies "ohlcv", so we need to format the data into a simple array of arrays.
        const ohlcv = ohlcData.map(c => [c.open, c.high, c.low, c.close, c.volume]);
        const pair = "BTCUSDT"; // The prompt uses this as an example, so we'll provide it.

        return `
            You are an expert quantitative strategist.
            Your ONLY job is to produce a single JSON object that tells me whether to BUY, SELL, or HOLD right now, based strictly on the most recent 720 candles (≈ last 30 trading days on a 1-hour timeframe).

            Input you will always receive:
            ohlcv: a list of the last 720 [open, high, low, close, volume] values, ordered from oldest (index 0) to newest (index 719)
            pair: the symbol being analysed (e.g., “BTCUSDT”)
            timeframe: “1h” (fixed)

            Rules you must follow:
            1. Perform all calculations internally; do NOT expose intermediate numbers in your answer.
            2. Use at least the following indicators on the 720-candle window:
               • 50-EMA and 200-EMA crossover
               • RSI(14) last value and 3-candle slope
               • MACD(12,26,9) histogram direction
               • 20-period ATR for volatility normalisation
               • Volume-weighted price change over the last 72 vs previous 648 candles (≈ first 90 %)
            3. Combine the above into a composite score ∈ [-1, +1]:
               • +1 = strong bullish setup, ‑1 = strong bearish setup.
            4. Map the score to an action:
               • score ≥ 0.3 → BUY
               • score ≤ ‑0.3 → SELL
               • otherwise → HOLD
            5. Output only the following JSON on a single line, with no extra text, explanation, or markdown:
               {"pair":"","action":"<BUY|SELL|HOLD>","score":}

            Example output for BTCUSDT:
            {"pair":"BTCUSDT","action":"BUY","score":0.42}
        `;
    }

    /**
     * Analyzes market data using the quantitative prompt and adapts the response.
     * @param {object} marketData - The consolidated data from the DataHandler.
     * @returns {Promise<object>} A promise that resolves to our bot's internal format { signal, confidence, reason }.
     */
    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data.' };
        }

        // The prompt now only needs the OHLC data.
        const prompt = this._createPrompt(marketData.ohlc);
        log.info("Generating signal with new Quantitative Strategist prompt...");

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const signalData = JSON.parse(cleanedText);

            // --- ADAPTATION LOGIC ---
            // We need to convert the AI's new output format to our bot's internal format.

            let internalSignal = 'HOLD';
            if (signalData.action === 'BUY') {
                internalSignal = 'LONG';
            } else if (signalData.action === 'SELL') {
                internalSignal = 'SHORT';
            }

            // We can convert the score from [-1, 1] to a confidence score of [0, 100].
            // We'll take the absolute value and multiply by 100.
            const confidence = Math.abs(signalData.score) * 100;

            const adaptedResponse = {
                signal: internalSignal,
                confidence: confidence,
                // The new prompt doesn't ask for a reason, so we'll use the score as the reason.
                reason: `AI calculated a composite score of ${signalData.score.toFixed(2)}.`
            };

            log.info(`AI Signal Received: ${signalData.action} (Score: ${signalData.score.toFixed(2)}). Adapted to: ${adaptedResponse.signal} (Confidence: ${adaptedResponse.confidence.toFixed(0)})`);
            return adaptedResponse;

        } catch (error) {
            log.error("Error generating or parsing signal from Quantitative prompt:", error);
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.' };
        }
    }
}
