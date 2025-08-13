// riskManager.js

import { log } from './logger.js';

/**
 * @class RiskManager
 * @description Handles position sizing for BTC-denominated contracts like PF_XBTUSD.
 */
export class RiskManager {
    constructor(config = {}) {
        this.leverage = config.leverage || 10;
        this.stopLossMultiplier = config.stopLossMultiplier || 2.0;
        this.takeProfitMultiplier = config.takeProfitMultiplier || 3.0;

        log.info("RiskManager initialized for BTC-DENOMINATED contracts (PF_XBTUSD):");
        log.info(`- Desired Leverage: ${this.leverage}x`);
    }

    _calculateATR(ohlcData, period = 14) {
        // This helper function remains the same
        if (ohlcData.length < period) {
            log.warn("Not enough OHLC data to calculate ATR.");
            return (ohlcData[ohlcData.length - 1].high - ohlcData[ohlcData.length - 1].low) || 0;
        }
        let trueRanges = [];
        for (let i = ohlcData.length - period; i < ohlcData.length; i++) {
            const high = ohlcData[i].high;
            const low = ohlcData[i].low;
            const prevClose = i > 0 ? ohlcData[i - 1].close : high;
            const tr1 = high - low;
            const tr2 = Math.abs(high - prevClose);
            const tr3 = Math.abs(low - prevClose);
            trueRanges.push(Math.max(tr1, tr2, tr3));
        }
        return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    }

    /**
     * Calculates trade parameters, ensuring prices adhere to the instrument's tick size.
     * @param {object} marketData - The consolidated data from the DataHandler.
     * @param {object} tradingSignal - The signal object from the StrategyEngine.
     * @returns {object|null} An object with trade parameters or null.
     */
    calculateTradeParameters(marketData, tradingSignal) {
        const { signal } = tradingSignal;
        const { balance, ohlc } = marketData;
        const lastPrice = ohlc[ohlc.length - 1].close;

        if (signal === 'HOLD') return null;

        const accountEquityUSD = balance;
        if (typeof accountEquityUSD !== 'number' || accountEquityUSD <= 0) {
            log.error("RiskManager: Invalid account equity (USD). Must be a positive number.");
            return null;
        }

        const notionalValueUSD = accountEquityUSD * this.leverage;
        if (lastPrice <= 0) {
            log.error("RiskManager: Invalid last price, cannot convert to BTC size.");
            return null;
        }
        const positionSizeInBTC = notionalValueUSD / lastPrice;

        if (positionSizeInBTC <= 0) {
            log.warn("RiskManager: Calculated BTC position size is zero. Skipping trade.");
            return null;
        }

        const atr = this._calculateATR(ohlc);
        if (atr === 0) {
            log.error("RiskManager: ATR is zero, cannot calculate a valid stop-loss.");
            return null;
        }
        const stopLossDistance = atr * this.stopLossMultiplier;
        
        const rawStopLossPrice = (signal === 'LONG') 
            ? lastPrice - stopLossDistance 
            : lastPrice + stopLossDistance;

        const rawTakeProfitPrice = (signal === 'LONG')
            ? lastPrice + (stopLossDistance * this.takeProfitMultiplier)
            : lastPrice - (stopLossDistance * this.takeProfitMultiplier);

        // --- CRITICAL CORRECTION FOR TICK SIZE ---
        // Round the prices to the nearest whole number to match the tick size of 1.
        const finalStopLossPrice = Math.round(rawStopLossPrice);
        const finalTakeProfitPrice = Math.round(rawTakeProfitPrice);

        const tradeParams = {
            size: parseFloat(positionSizeInBTC.toFixed(4)), // Size can be a float (BTC)
            stopLoss: finalStopLossPrice,                   // Price must be an integer
            takeProfit: finalTakeProfitPrice,               // Price must be an integer
        };
        
        log.info("--- Risk Calculation Complete (BTC-Denominated, Tick-Aware) ---");
        log.info(`- Notional Value (USD): $${notionalValueUSD.toFixed(2)}`);
        log.info(`- Calculated Position Size (BTC): ${tradeParams.size}`);
        log.info(`- Raw SL/TP: ${rawStopLossPrice.toFixed(2)} / ${rawTakeProfitPrice.toFixed(2)}`);
        log.info(`- Final Rounded SL/TP: ${tradeParams.stopLoss} / ${tradeParams.takeProfit}`);
        
        return tradeParams;
    }
}
