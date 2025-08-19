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
        this.model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", safetySettings });
        log.info("StrategyEngine initialized (Project Chimera).");
    }

    // We combine the system and user prompts into one
    _createFullPrompt(marketData) {
        const dataPayload = JSON.stringify(marketData, null, 2);

        // --- THIS IS THE COMBINED PROMPT ---
        return `
            // SYSTEM INSTRUCTION START
            You are a senior quantitative trader.  
            Your only task is to output a single JSON object with the following keys:

            - signal            : "BUY" | "SELL" | "HOLD"
            - confidence        : 0-100 (integer)
            - entry_price       : <float>
            - stop_loss_price   : <float>
            - take_profit_price : <float>
            - risk_reward       : <float>
            - reasoning         : <string, max 150 chars>

            Rules of engagement
            1. Time-frame: 15m, 1h, 4h, 1d. Default to 1h unless volatility > 3%/h.
            2. Risk per trade: 1% of notional; stop distance = 1.2×ATR(14).
            3. Minimum R:R = 1:2. Reject setups below this.
            4. Confluence required: ≥2 of (trend, momentum, volume, order-flow, sentiment).
            5. Adjust stop to breakeven once price moves 1R in favour.

            Calculation protocol
            1. Compute short-term trend with a 20/50 EMA crossover.
            2. Compute momentum with 14-period RSI and 12/26 MACD.
            3. Compute volume pressure: (current volume ÷ 20-period average) × sign(close-open).
            4. Compute order-flow toxicity: (bid-ask imbalance) × (market-order flow).
            5. Compute sentiment z-score vs 30-day mean.
            6. Compute whale flow: net inflow/outflow in BTC.
            7. Combine 1-6 into a weighted ensemble score (give 25% to 6).
            8. Derive entry, SL, TP using ATR and nearest high-volume node (VPVR).
            9. Round prices to nearest $5 (tick size on most venues).

            Output ONLY the JSON, no markdown fences or comments.
            // SYSTEM INSTRUCTION END

            // USER PROMPT START
            Timestamp: ${new Date().toISOString()}
            <data>
            ${dataPayload}
            </data>

            Generate the signal.
            // USER PROMPT END
        `;
    }

    async generateSignal(marketData) {
        if (!marketData?.ohlc_1h?.length) {
            return { signal: 'HOLD' };
        }

        let strategistResult = null;
        try {
            // --- THIS IS THE FIX ---
            // We create one single prompt and use the reliable generateContent method.
            const fullPrompt = this._createFullPrompt(marketData);

            // --- THIS IS THE FIX ---
            // Let's print the exact prompt we are about to send.
            log.info(`--- FINAL PROMPT SENT TO GEMINI ---\n${fullPrompt}\n------------------------------------`);
            log.info("Generating Chimera signal using generateContent...");
            strategistResult = await this.model.generateContent(fullPrompt);
            
            const responseText = strategistResult.response.text();
            log.info(`[GEMINI_RAW_RESPONSE]:\n---\n${responseText}\n---`);

            if (!responseText) { throw new Error("Received an empty response from the AI."); }
            
            const jsonMatch = responseText.match(/\{.*\}/s);
            if (!jsonMatch) { throw new Error("No valid JSON object found in the AI's response."); }
            
            const signalData = JSON.parse(jsonMatch[0]);
            return signalData;

        } catch (error) {
            log.error(`--- ERROR HANDLING AI RESPONSE ---`);
            log.error(`Full API Result Object Was: \n${JSON.stringify(strategistResult, null, 2)}`);
            log.error(`Error Details:`, error); // Log the full error object
            log.error(`------------------------------------`);
            return { signal: 'HOLD' };
        }
    }
}
