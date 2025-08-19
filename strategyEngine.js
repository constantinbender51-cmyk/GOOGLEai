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
        log.info("StrategyEngine initialized with a two-prompt (Calculator -> Strategist) architecture.");
    }

    /**
     * Prompt 1: The "Calculator". Takes OHLC data and returns raw indicator values.
     */
    _createCalculatorPrompt(ohlcData) {
        // --- THE FIX ---
        // We must embed the data directly into the prompt string for the API to accept it.
        const ohlcvString = JSON.stringify(ohlcData.map(c => [c.open, c.high, c.low, c.close, c.volume]));

        return `
            You are a pure technical analysis calculator. You have been provided with 720 1-hour OHLCV candles.
            Your ONLY job is to calculate the following indicators based on the most recent data point and return them in a single JSON object.
            - The value of the 50-period EMA.
            - The value of the 200-period EMA.
            - The value of the 14-period RSI.
            - The 3-candle slope of the RSI.
            - The value of the MACD(12,26,9) histogram.
            - The value of the 20-period ATR.
            
            Here is the OHLCV data:
            ${ohlcvString}

            Output ONLY a JSON object with the keys: "ema_50", "ema_200", "rsi_14", "rsi_slope", "macd_histogram", "atr_20".
        `;
    }

    /**
     * Prompt 2: The "Strategist". Takes indicator values and makes a trading decision.
     */
    _createStrategistPrompt(indicatorData) {
        // This prompt is fine as it only takes a small, simple JSON object.
        return `
            You are an expert quantitative strategist. You have been provided with a set of pre-calculated technical indicators.
            Your ONLY job is to use these indicators to produce a single JSON trading signal.

            **Provided Indicators:**
            ${JSON.stringify(indicatorData, null, 2)}

            **Internal Analysis Rules:**
            1.  Calculate a composite score from -1 to +1 based on the provided indicators.
            2.  Based on the score, determine a "signal": "LONG" if score >= 0.3, "SHORT" if score <= -0.3, otherwise "HOLD".
            3.  Calculate "confidence" by taking the absolute value of your score and multiplying by 100.
            4.  If the signal is LONG or SHORT, set "stop_loss_distance_in_usd" to be the provided "atr_20" value multiplied by 2.0. If HOLD, this must be 0.
            5.  Create a one-sentence "reason" explaining your decision, including the composite score.

            **Output Task:**
            Output ONLY a JSON object with the four keys: "signal", "confidence", "reason", and "stop_loss_distance_in_usd".
        `;
    }

    async generateSignal(marketData) {
        if (!marketData?.ohlc?.length) {
            log.warn("StrategyEngine: Invalid or empty OHLC data provided.");
            return { signal: 'HOLD', confidence: 0, reason: 'Insufficient market data.', stop_loss_distance_in_usd: 0 };
        }

        try {
            // --- STEP 1: CALCULATE INDICATORS ---
            const calculatorPrompt = this._createCalculatorPrompt(marketData.ohlc);
            log.info("Generating signal (Step 1: Calculating Indicators)...");
            // --- THE FIX ---
            // We now pass only the prompt string, as the data is embedded within it.
            const calculatorResult = await this.model.generateContent(calculatorPrompt);
            const indicatorJsonText = calculatorResult.response.text().trim().match(/\{.*\}/s)[0];
            const indicatorData = JSON.parse(indicatorJsonText);
            log.info(`[AI_CALCULATOR_OUTPUT]: ${JSON.stringify(indicatorData)}`);

            // --- STEP 2: MAKE STRATEGIC DECISION ---
            const strategistPrompt = this._createStrategistPrompt(indicatorData);
            log.info("Generating signal (Step 2: Making Strategic Decision)...");
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
            log.error("Error during two-prompt (Calculator -> Strategist) signal generation:", error);
            return { signal: 'HOLD', confidence: 0, reason: 'Failed to get a valid signal from the AI model.', stop_loss_distance_in_usd: 0 };
        }
    }
}
