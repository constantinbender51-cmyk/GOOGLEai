// strategyEngine.js

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { log } from './logger.js';
import { calculateIndicatorSeries } from './indicators.js';

export class StrategyEngine {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const safetySettings = [{
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        }];
        this.model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", safetySettings });
        log.info("StrategyEngine V3 initialized (Full Autonomy).");
    }

    _createPrompt(contextualData) {
        const dataPayload = JSON.stringify(contextualData, null, 2);

        return `
            You are an expert quantitative strategist and risk manager for the PF_XBTUSD market.
            Your ONLY job is to produce a single JSON object that defines a complete trade plan.

            **Provided Market Data:**
            You have been provided with the last 720 1-hour OHLC candles and their corresponding indicator series.
            ${dataPayload}

            **Your Task (Produce the final JSON based on your complete analysis):**
            1.  **"signal"**: Decide on one of three actions: "LONG", "SHORT", or "HOLD".
            2.  **"confidence"**: Directly determine your confidence in this signal, from 0 to 100. A confidence below 50 must result in a "HOLD" signal.
            3.  **"stop_loss_distance_in_usd"**: This is a critical risk management parameter. Provide the optimal stop-loss distance in USD, based on all available data (volatility, support/resistance, market structure). If the signal is HOLD, this must be 0.
            4.  **"take_profit_distance_in_usd"**: Provide the optimal take-profit distance in USD. This should be based on your analysis of potential price targets and the market's current momentum. If the signal is HOLD, this must be 0.
            5.  **"reason"**: Provide a detailed, step-by-step explanation for your entire trade plan.

            **Output Format (Strict JSON only):**
            Return ONLY a JSON object with the five keys: "signal", "confidence", "reason", "stop_loss_distance_in_usd", and "take_profit_distance_in_usd".
        `;
    }

    async generateSignal(marketData) {
        // ... (The internal logic of this function remains the same, as it's already robust)
        // It will now parse the new 5-key JSON response.
    }
}
