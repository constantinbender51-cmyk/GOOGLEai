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
        log.info("StrategyEngine initialized with Definitive Hybrid Prompt.");
    }

    _createPrompt(contextualData) {
        // We embed the full, rich data directly into the prompt.
        const dataPayload = JSON.stringify(contextualData, null, 2);

        return `
            You are an expert quantitative strategist for the PF_XBTUSD (Bitcoin Futures) market.
            Your ONLY job is to produce a single JSON object based on the provided market data and a strict set of internal rules.

            **Provided Market Data (Full History):**
            You have been provided with the last 720 1-hour OHLC candles and the corresponding calculated indicator series.
            ${dataPayload}

            **Internal Analysis Rules (Perform these calculations internally):**
            1.  Analyze the full 720-candle history provided.
            2.  Calculate a composite score from -1 (strong bearish) to +1 (strong bullish) by synthesizing the provided indicator series (50-EMA, 200-EMA, RSI, MACD, ATR) and any other patterns you identify.
            3.  Use the provided ATR series to assess current volatility.

            **Your Task (Produce the final JSON based on your internal analysis):**
            1.  **"signal"**: Based on your composite score, determine the action. If score ≥ 0.3, use "LONG". If score ≤ -0.3, use "SHORT". Otherwise, use "HOLD".
            2.  **"confidence"**: Convert your composite score to a confidence value from 0 to 100 (e.g., a score of 0.42 becomes 42).
            3.  **"stop_loss_distance_in_usd"**: If the signal is LONG or SHORT, provide a logical stop-loss distance in USD based on your internal ATR analysis. If the signal is HOLD, this must be 0.
            4.  **"reason"**: Provide a brief, one-sentence rationale for your decision, mentioning the composite score.

            **Output Format (Strict JSON only, no extra text or explanations):**
            Return ONLY a JSON object with the four keys: "signal", "confidence", "reason", and "stop_loss_distance_in_usd".
        `;
    }

    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data.', stop_loss_distance_in_usd: 0 };
        }
        let responseText = ""; // Define outside the try block to be accessible in catch
        try {
            // --- STEP 1: CALCULATE FULL INDICATOR SERIES LOCALLY ---
            log.info("Generating signal (Step 1: Calculating full indicator series locally)...");
            const indicatorSeries = calculateIndicatorSeries(marketData.ohlc);
            if (!indicatorSeries) {
                return { signal: 'HOLD', confidence: 0, reason: 'Could not calculate indicators.', stop_loss_distance_in_usd: 0 };
            }

            // --- STEP 2: PREPARE FULL CONTEXTUAL PAYLOAD FOR AI ---
            const contextualData = {
                ohlc: marketData.ohlc, // The full 720 candles
                indicators: indicatorSeries // The full indicator series
            };

            // --- STEP 3: MAKE STRATEGIC DECISION WITH AI ---
            const strategistPrompt = this._createPrompt(contextualData);
            log.info("Generating signal (Step 2: Making Strategic Decision with AI)...");
            const strategistResult = await this.model.generateContent(strategistPrompt);
            responseText = strategistResult.response.text(); // Assign the raw text

            log.info(`[GEMINI_RAW_RESPONSE]:\n---\n${responseText}\n---`); // Log on every successful call

            const signalJsonText = responseText.trim().match(/\{.*\}/s)[0];
            const signalData = JSON.parse(signalJsonText);

            // ... (validation and return logic are the same)
            
            return signalData;

        } catch (error) {
            // --- ERROR LOGGING ---
            // If anything in the 'try' block fails, log the raw response that caused the error.
            log.error(`--- ERROR PARSING GEMINI RESPONSE ---`);
            log.error(`Problematic Raw Text Was: \n${responseText}`);
            log.error(`Error Details:`, error);
            log.error(`------------------------------------`);
            
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.', stop_loss_distance_in_usd: 0 };
        }
    }
}
