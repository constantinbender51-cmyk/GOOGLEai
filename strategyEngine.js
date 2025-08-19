// strategyEngine.js

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { log } from './logger.js';
import { calculateIndicators } from './indicators.js'; // Import our new local calculator

export class StrategyEngine {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const safetySettings = [{
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
        }];
        this.model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", safetySettings });
        log.info("StrategyEngine initialized with local indicators and AI Strategist.");
    }

    _createStrategistPrompt(indicatorData) {
        return `
            You are an expert quantitative strategist. Based on these pre-calculated indicators, produce a single JSON trading signal.

            **Provided Indicators:**
            ${JSON.stringify(indicatorData, null, 2)}

            **Rules:**
            1.  Calculate a composite score from -1 to +1 based on the indicators.
            2.  Determine a "signal": "LONG" if score >= 0.3, "SHORT" if score <= -0.3, otherwise "HOLD".
            3.  Calculate "confidence" as the absolute value of the score multiplied by 100.
            4.  Set "stop_loss_distance_in_usd" to be the "atr_20" value multiplied by 2.0 (or 0 if HOLD).
            5.  Create a one-sentence "reason" for your decision.

            **Output Task:**
            Output ONLY a JSON object with the keys: "signal", "confidence", "reason", and "stop_loss_distance_in_usd".
        `;
    }

    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data.', stop_loss_distance_in_usd: 0 };
        }

        try {
            // --- STEP 1: CALCULATE INDICATORS LOCALLY ---
            log.info("Generating signal (Step 1: Calculating Indicators Locally)...");
            const indicatorData = calculateIndicators(marketData.ohlc);
            if (!indicatorData) {
                return { signal: 'HOLD', confidence: 0, reason: 'Could not calculate indicators.', stop_loss_distance_in_usd: 0 };
            }

            // --- STEP 2: MAKE STRATEGIC DECISION WITH AI ---
            const strategistPrompt = this._createStrategistPrompt(indicatorData);
            log.info("Generating signal (Step 2: Making Strategic Decision with AI)...");
            const strategistResult = await this.model.generateContent(strategistPrompt);
            const signalJsonText = strategistResult.response.text().trim().match(/\{.*\}/s)[0];
            const signalData = JSON.parse(signalJsonText);

            // --- VALIDATION ---
            if (!['LONG', 'SHORT', 'HOLD'].includes(signalData.signal) || typeof signalData.confidence !== 'number' || typeof signalData.stop_loss_distance_in_usd !== 'number') {
                throw new Error(`Invalid or malformed JSON from Strategist AI: ${JSON.stringify(signalData)}`);
            }

            log.info(`AI Signal Successfully Parsed: ${signalData.signal} (Confidence: ${signalData.confidence}) | Reason: ${signalData.reason} | Suggested SL: $${signalData.stop_loss_distance_in_usd}`);
            return signalData;

        } catch (error) {
            log.error("Error during local-indicator -> AI-strategist signal generation:", error);
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.', stop_loss_distance_in_usd: 0 };
        }
    }
}
