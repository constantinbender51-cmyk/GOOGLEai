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
        log.info("StrategyEngine initialized with Quantitative Strategist prompt (with Stop-Loss).");
    }

    _createPrompt(ohlcData) {
        const lastPrice = ohlcData[ohlcData.length - 1].close;
        const ohlcv = ohlcData.map(c => [c.open, c.high, c.low, c.close, c.volume]);
        const pair = "BTCUSDT";

        return `
            You are an expert quantitative strategist.
            Your ONLY job is to produce a single JSON object that tells me whether to BUY, SELL, or HOLD right now, based strictly on the most recent 720 candles.

            Input you will always receive:
            ohlcv: a list of the last 720 [open, high, low, close, volume] values.
            pair: the symbol being analysed.
            timeframe: “1h” (fixed)

            Rules you must follow:
            1. Perform all calculations internally.
            2. Use at least the following indicators: 50/200-EMA crossover, RSI(14) value and slope, MACD(12,26,9) histogram, 20-period ATR, and a custom volume-weighted price change indicator.
            3. Combine the above into a composite score ∈ [-1, +1].
            4. Map the score to an action: score ≥ 0.3 → BUY, score ≤ ‑0.3 → SELL, otherwise → HOLD.
            5. **If the action is BUY or SELL, suggest a logical stop_loss_distance_in_usd based on your internal ATR calculation and the current market volatility. This value should be a positive number. If the action is HOLD, this value must be 0.**
            6. Output only the following JSON on a single line, with no extra text, explanation, or markdown:
               {"pair":"","action":"<BUY|SELL|HOLD>","score":,"stop_loss_distance_in_usd":}

            Example output for a BUY action with a current price of $65,000:
            {"pair":"BTCUSDT","action":"BUY","score":0.42,"stop_loss_distance_in_usd":850}

            Example output for a HOLD action:
            {"pair":"BTCUSDT","action":"HOLD","score":0.15,"stop_loss_distance_in_usd":0}
        `;
    }

    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data.', stop_loss_distance_in_usd: 0 };
        }

        const prompt = this._createPrompt(marketData.ohlc);
        log.info("Generating signal with new Quantitative Strategist prompt...");

        try {
            const result = await this.model.generateContent(prompt);
            const responseText = result.response.text();
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const signalData = JSON.parse(cleanedText);

            // --- ADAPTATION LOGIC ---
            let internalSignal = 'HOLD';
            if (signalData.action === 'BUY') {
                internalSignal = 'LONG';
            } else if (signalData.action === 'SELL') {
                internalSignal = 'SHORT';
            }

            const confidence = Math.abs(signalData.score) * 100;

            const adaptedResponse = {
                signal: internalSignal,
                confidence: confidence,
                reason: `AI calculated a composite score of ${signalData.score.toFixed(2)}.`,
                // We now get the stop-loss distance directly from the AI.
                stop_loss_distance_in_usd: signalData.stop_loss_distance_in_usd || 0
            };

            log.info(`AI Signal Received: ${signalData.action} (Score: ${signalData.score.toFixed(2)}). Adapted to: ${adaptedResponse.signal} (Confidence: ${adaptedResponse.confidence.toFixed(0)}), Suggested SL: $${adaptedResponse.stop_loss_distance_in_usd}`);
            
            // We need to pass this adapted response to the RiskManager, which already knows how to use it.
            return adaptedResponse;

        } catch (error) {
            log.error("Error generating or parsing signal from Quantitative prompt:", error);
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.', stop_loss_distance_in_usd: 0 };
        }
    }
}
