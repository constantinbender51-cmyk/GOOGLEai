import { EMA, RSI, MACD, ATR } from 'technicalindicators';
import { log } from './logger.js';

/**
 * Calculates recent series for all necessary technical indicators.
 * @param {Array<object>} ohlcData - Array of OHLC candles.
 * @param {number} seriesLength - The number of recent values to return for each indicator.
 * @returns {object|null} An object with all calculated indicator series, or null if data is insufficient.
 */
export function calculateIndicatorSeries(ohlcData, seriesLength = 50) {
    if (ohlcData.length < 200) {
        log.warn(`[INDICATORS] Insufficient data for calculation. Need 200 candles, have ${ohlcData.length}.`);
        return null;
    }

    const close = ohlcData.map(c => c.close);
    const high = ohlcData.map(c => c.high);
    const low = ohlcData.map(c => c.low);

    // Calculate full series
    const ema50 = EMA.calculate({ period: 50, values: close });
    const ema200 = EMA.calculate({ period: 200, values: close });
    const rsi = RSI.calculate({ period: 14, values: close });
    const macd = MACD.calculate({ values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const atr = ATR.calculate({ high, low, close, period: 20 });

    // Extract the last 'seriesLength' values for each
    const indicatorSeries = {
        ema_50_series: ema50.slice(-seriesLength),
        ema_200_series: ema200.slice(-seriesLength),
        rsi_14_series: rsi.slice(-seriesLength),
        macd_histogram_series: macd.map(m => m.histogram).slice(-seriesLength),
        atr_20_series: atr.slice(-seriesLength)
    };

    log.info(`[INDICATORS] Calculated series of length ${seriesLength}.`);
    return indicatorSeries;
}
