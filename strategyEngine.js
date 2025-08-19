// strategyEngine.js

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { log } from './logger.js';
import { calculateIndicatorSeries } from './indicators.js'; // Import our new series calculator

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

    _createStrategistPrompt(contextualData) {
        return `
            You are an expert quantitative strategist. You have been provided with pre-processed market data for PF_XBTUSD.
            Your task is to synthesize this data into a single, final JSON trading signal.

            **Provided Data:**
            1.  **Recent OHLC Candles:** The last 50 hours of price action.
            2.  **Indicator Series:** The last 50 values for key technical indicators (EMAs, RSI, MACD, ATR).

            **Data Payload:**
            ${JSON.stringify(contextualData, null, 2)}

            **Your Task:**
            Analyze all the provided data to understand the market's trend, momentum, and volatility.
            1.  Form a holistic view. Do not just look at the last value, but the *shape and interaction* of the data series.
            2.  Based on your analysis, determine a "signal": "LONG", "SHORT", or "HOLD".
            3.  Assign a "confidence" score from 0 to 100.
            4.  Suggest a "stop_loss_distance_in_usd" based on the recent ATR values.
            5.  Provide a one-sentence "reason" for your decision.

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
            // --- STEP 1: CALCULATE INDICATOR SERIES LOCALLY ---
            const seriesLength = 50;
            log.info(`Generating signal (Step 1: Calculating ${seriesLength}-period indicator series locally)...`);
            const indicatorSeries = calculateIndicatorSeries(marketData.ohlc, seriesLength);
            if (!indicatorSeries) {
                return { signal: 'HOLD', confidence: 0, reason: 'Could not calculate indicators.', stop_loss_distance_in_usd: 0 };
            }

            // --- STEP 2: PREPARE CONTEXTUAL PAYLOAD FOR AI ---
            const contextualData = {
                recent_ohlc: marketData.ohlc.slice(-seriesLength), // Also send the last 50 raw candles
                indicators: indicatorSeries
            };

            // --- STEP 3: MAKE STRATEGIC DECISION WITH AI ---
            const strategistPrompt = this._createStrategistPrompt(contextualData);
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
