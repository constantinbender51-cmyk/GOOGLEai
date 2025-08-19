// riskManager.js

import { log } from './logger.js';

export class RiskManager {
    constructor(config = {}) {
        this.leverage = config.leverage || 10;
        this.stopLossMultiplier = config.stopLossMultiplier || 2.0;
        this.takeProfitMultiplier = config.takeProfitMultiplier || 3.0;
        this.marginBuffer = config.marginBuffer || 0.005;
        log.info("RiskManager initialized for BTC-DENOMINATED contracts (PF_XBTUSD):");
        log.info(`- Desired Leverage: ${this.leverage}x`);
        log.info(`- Margin Buffer: ${this.marginBuffer * 100}%`);
    }

    _calculateATR(ohlcData, period = 14) {
        if (ohlcData.length < period) {
            log.warn("[RISK_DEBUG] Not enough OHLC data to calculate ATR.");
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

    calculateTradeParameters(marketData, tradingSignal) {
        const { signal } = tradingSignal;
        const { balance, ohlc } = marketData;
        const lastPrice = ohlc[ohlc.length - 1].close;

        log.info("[RISK_DEBUG] --- Starting Risk Calculation ---");
        log.info(`[RISK_DEBUG] Signal: ${signal}, Balance: ${balance}, Last Price: ${lastPrice}`);

        if (signal === 'HOLD') {
            log.info("[RISK_DEBUG] Signal is HOLD. No calculation needed.");
            return null;
        }

        if (typeof balance !== 'number' || balance <= 0) {
            log.error("[RISK_DEBUG] Invalid account balance. Must be a positive number.");
            return null;
        }

        const desiredNotionalValueUSD = balance * this.leverage;
        const bufferedNotionalValueUSD = desiredNotionalValueUSD * (1 - this.marginBuffer);
        log.info(`[RISK_DEBUG] Buffered Notional Value (USD): $${bufferedNotionalValueUSD.toFixed(2)}`);

        if (lastPrice <= 0) {
            log.error("[RISK_DEBUG] Invalid last price, cannot convert to BTC size.");
            return null;
        }
        const positionSizeInBTC = bufferedNotionalValueUSD / lastPrice;
        log.info(`[RISK_DEBUG] Calculated Position Size (BTC): ${positionSizeInBTC}`);
        
        if (positionSizeInBTC <= 0) {
            log.warn("[RISK_DEBUG] Calculated BTC position size is zero or negative. Skipping trade.");
            return null;
        }

        const atr = this._calculateATR(ohlc);
        log.info(`[RISK_DEBUG] Calculated ATR: ${atr}`);
        if (atr === 0) {
            log.error("[RISK_DEBUG] ATR is zero, cannot calculate a valid stop-loss.");
            return null;
        }

        const stopLossDistance = atr * this.stopLossMultiplier;
        const rawStopLossPrice = (signal === 'LONG') ? lastPrice - stopLossDistance : lastPrice + stopLossDistance;
        const rawTakeProfitPrice = (signal === 'LONG') ? lastPrice + (stopLossDistance * this.takeProfitMultiplier) : lastPrice - (stopLossDistance * this.takeProfitMultiplier);
        const finalStopLossPrice = Math.round(rawStopLossPrice);
        const finalTakeProfitPrice = Math.round(rawTakeProfitPrice);

        const tradeParams = {
            size: parseFloat(positionSizeInBTC.toFixed(4)),
            stopLoss: finalStopLossPrice,
            takeProfit: finalTakeProfitPrice,
        };
        
        log.info(`[RISK_DEBUG] Final Trade Params: ${JSON.stringify(tradeParams)}`);
        log.info("[RISK_DEBUG] --- Risk Calculation Complete ---");
        
        return tradeParams;
    }
}
