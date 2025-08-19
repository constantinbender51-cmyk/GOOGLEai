import { EMA, RSI, MACD, ATR, SMA } from 'technicalindicators';
import { log } from './logger.js';

/**
 * Calculates a comprehensive suite of technical indicators required by the "Chimera" prompt.
 * @param {Array<object>} ohlcData - An array of OHLCV candle objects.
 * @returns {object|null} An object containing the final, single-value indicators, or null if data is insufficient.
 */
export function calculateIndicatorSeries(ohlcData) {
    const requiredCandles = 200; // The longest period needed is the 200-EMA
    if (ohlcData.length < requiredCandles) {
        log.warn(`[INDICATORS] Insufficient data for Chimera calculation. Need ${requiredCandles}, have ${ohlcData.length}.`);
        return null;
    }

    const closePrices = ohlcData.map(c => c.close);
    const highPrices = ohlcData.map(c => c.high);
    const lowPrices = ohlcData.map(c => c.low);
    const volumes = ohlcData.map(c => c.volume);
    const currentCandle = ohlcData[ohlcData.length - 1];

    try {
        // 1. EMA Crossover (20/50 as per prompt)
        const ema20 = EMA.calculate({ period: 20, values: closePrices });
        const ema50 = EMA.calculate({ period: 50, values: closePrices });

        // 2. Momentum (RSI and MACD)
        const rsi = RSI.calculate({ period: 14, values: closePrices });
        const macd = MACD.calculate({
            values: closePrices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
        });
        const rsiSeries = rsi.slice(-3); // Get last 3 RSI values for slope
        const rsiSlope = (rsiSeries.length === 3) ? (rsiSeries[2] - rsiSeries[0]) / 2 : 0;

        // 3. Volume Pressure
        const volumeSma20 = SMA.calculate({ period: 20, values: volumes });
        const lastVolumeSma = volumeSma20[volumeSma20.length - 1];
        const volumePressure = (lastVolumeSma > 0)
            ? (currentCandle.volume / lastVolumeSma) * Math.sign(currentCandle.close - currentCandle.open)
            : 0;

        // 4. Volatility (ATR)
        const atrInput = { high: highPrices, low: lowPrices, close: closePrices, period: 14 };
        const atr = ATR.calculate(atrInput);

        // Return the final, single value for each indicator
        return {
            ema_20: ema20[ema20.length - 1],
            ema_50: ema50[ema50.length - 1],
            rsi_14: rsi[rsi.length - 1],
            rsi_slope_3: rsiSlope,
            macd_histogram: macd[macd.length - 1]?.histogram,
            volume_pressure: volumePressure,
            atr_14: atr[atr.length - 1]
        };

    } catch (error) {
        log.error("[INDICATORS] Error during Chimera indicator calculation.", error);
        return null;
    }
}
