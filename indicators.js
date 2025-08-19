import { EMA, RSI, MACD, ATR } from 'technicalindicators';
import { log } from './logger.js';

/**
 * Calculates all necessary technical indicators from OHLC data.
 * @param {Array<object>} ohlcData - Array of OHLC candles ({ open, high, low, close, volume, timestamp }).
 * @returns {object|null} An object with all calculated indicator values, or null if data is insufficient.
 */
export function calculateIndicators(ohlcData) {
    if (ohlcData.length < 200) { // Need at least 200 periods for the longest EMA
        log.warn(`[INDICATORS] Insufficient data for calculation. Need 200 candles, have ${ohlcData.length}.`);
        return null;
    }

    const close = ohlcData.map(c => c.close);
    const high = ohlcData.map(c => c.high);
    const low = ohlcData.map(c => c.low);

    // EMA
    const ema50 = EMA.calculate({ period: 50, values: close });
    const ema200 = EMA.calculate({ period: 200, values: close });

    // RSI
    const rsi = RSI.calculate({ period: 14, values: close });
    const lastRsi = rsi[rsi.length - 1];
    const prevRsi = rsi[rsi.length - 4]; // 3 candles ago
    const rsiSlope = lastRsi - prevRsi;

    // MACD
    const macdInput = {
        values: close,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    };
    const macd = MACD.calculate(macdInput);
    const lastMacd = macd[macd.length - 1];

    // ATR
    const atrInput = {
        high: high,
        low: low,
        close: close,
        period: 20
    };
    const atr = ATR.calculate(atrInput);

    const indicatorValues = {
        ema_50: ema50[ema50.length - 1],
        ema_200: ema200[ema200.length - 1],
        rsi_14: lastRsi,
        rsi_slope: rsiSlope,
        macd_histogram: lastMacd.histogram,
        atr_20: atr[atr.length - 1]
    };

    log.info(`[INDICATORS] Calculated values: ${JSON.stringify(indicatorValues)}`);
    return indicatorValues;
}
