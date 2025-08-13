// riskManager.js

import { log } from './logger.js';

/**
 * @class RiskManager
 * @description Handles position sizing for BTC-denominated contracts like PF_XBTUSD.
 */
export class RiskManager {
    /**
     * @param {object} config - Configuration for the risk manager.
     * @param {number} [config.leverage=10] - The desired leverage to use for trades.
     * @param {number} [config.stopLossMultiplier=2.0] - A factor to calculate the stop-loss based on volatility (e.g., 2x ATR).
     * @param {number} [config.takeProfitMultiplier=3.0] - A factor to calculate the take-profit based on the stop-loss (e.g., 3x the risk).
     * @param {number} [config.marginBuffer=0.005] - A safety buffer (e.g., 0.005 for 0.5%) to reduce calculated size.
     */
    constructor(config = {}) {
        this.leverage = config.leverage || 10;
        this.stopLossMultiplier = config.stopLossMultiplier || 2.0;
        this.takeProfitMultiplier = config.takeProfitMultiplier || 3.0;
        this.marginBuffer = config.marginBuffer || 0.005; // Default to 0.5% buffer

        log.info("RiskManager initialized for BTC-DENOMINATED contracts (PF_XBTUSD):");
        log.info(`- Desired Leverage: ${this.leverage}x`);
        log.info(`- Margin Buffer: ${this.marginBuffer * 100}%`);
    }

    _calculateATR(ohlcData, period = 14) {
        // ... (This helper function remains the same)
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
     * Calculates trade parameters, converting USD notional value to a BTC order size.
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

        // 1. Calculate the total desired notional value of the position in USD.
        // Apply the margin buffer here to reduce the size slightly.
        const desiredNotionalValueUSD = accountEquityUSD * this.leverage;
        const bufferedNotionalValueUSD = desiredNotionalValueUSD * (1 - this.marginBuffer);


        // 2. Convert the USD notional value to the BTC order size.
        if (lastPrice <= 0) {
            log.error("RiskManager: Invalid last price, cannot convert to BTC size.");
            return null;
        }
        const positionSizeInBTC = bufferedNotionalValueUSD / lastPrice;
        
        if (positionSizeInBTC <= 0) {
            log.warn("RiskManager: Calculated BTC position size is zero. Skipping trade.");
            return null;
        }

        // 3. Calculate Stop-Loss and Take-Profit
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

        const finalStopLossPrice = Math.round(rawStopLossPrice);
        const finalTakeProfitPrice = Math.round(rawTakeProfitPrice);

        const tradeParams = {
            size: parseFloat(positionSizeInBTC.toFixed(4)),
            stopLoss: finalStopLossPrice,
            takeProfit: finalTakeProfitPrice,
        };
        
        log.info("--- Risk Calculation Complete (BTC-Denominated, Tick-Aware) ---");
        log.info(`- Account Equity (USD): $${accountEquityUSD.toFixed(2)}`);
        log.info(`- Desired Leverage: ${this.leverage}x`);
        log.info(`- Desired Notional Value (USD): $${desiredNotionalValueUSD.toFixed(2)}`);
        log.info(`- Buffered Notional Value (USD): $${bufferedNotionalValueUSD.toFixed(2)}`);
        log.info(`- Current BTC Price: $${lastPrice}`);
        log.info(`- Calculated Position Size (BTC): ${tradeParams.size}`);
        log.info(`- Final Rounded SL/TP: ${tradeParams.stopLoss} / ${tradeParams.takeProfit}`);
        
        return tradeParams;
    }
}
