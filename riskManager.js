// riskManager.js

import { log } from './logger.js';

export class RiskManager {
    constructor(config = {}) {
        this.leverage = config.leverage || 10;
        // We still keep takeProfitMultiplier as a simple rule for now
        this.takeProfitMultiplier = config.takeProfitMultiplier || 3.0; 
        this.marginBuffer = config.marginBuffer || 0.005;
        log.info("RiskManager initialized (AI-driven Stop-Loss):");
        log.info(`- Desired Leverage: ${this.leverage}x`);
        log.info(`- Margin Buffer: ${this.marginBuffer * 100}%`);
    }

    // The _calculateATR function is no longer needed for stop-loss calculation.
    // We can remove it or keep it for other potential uses. Let's remove it for clarity.

    calculateTradeParameters(marketData, tradingSignal) {
        const { signal, stop_loss_distance_in_usd } = tradingSignal;
        const { balance, ohlc } = marketData;
        const lastPrice = ohlc[ohlc.length - 1].close;

        log.info("[RISK] --- Starting AI-Driven Risk Calculation ---");
        log.info(`[RISK] Signal: ${signal}, Balance: ${balance}, Last Price: ${lastPrice}`);

        if (signal === 'HOLD' || !stop_loss_distance_in_usd || stop_loss_distance_in_usd <= 0) {
            log.info("[RISK] Signal is HOLD or Stop-Loss distance is invalid. No trade.");
            return null;
        }

        if (typeof balance !== 'number' || balance <= 0) {
            log.error("[RISK] Invalid account balance.");
            return null;
        }

        const desiredNotionalValueUSD = balance * this.leverage;
        const bufferedNotionalValueUSD = desiredNotionalValueUSD * (1 - this.marginBuffer);
        log.info(`[RISK] Buffered Notional Value (USD): $${bufferedNotionalValueUSD.toFixed(2)}`);

        if (lastPrice <= 0) {
            log.error("[RISK] Invalid last price.");
            return null;
        }
        const positionSizeInBTC = bufferedNotionalValueUSD / lastPrice;
        log.info(`[RISK] Calculated Position Size (BTC): ${positionSizeInBTC}`);
        
        if (positionSizeInBTC <= 0) {
            log.warn("[RISK] Calculated BTC position size is zero or negative.");
            return null;
        }

        // --- THE KEY CHANGE ---
        // We now use the stop-loss distance provided directly by the AI.
        const stopLossDistance = stop_loss_distance_in_usd;
        log.info(`[RISK] Using AI-suggested Stop-Loss Distance: $${stopLossDistance}`);

        const rawStopLossPrice = (signal === 'LONG') ? lastPrice - stopLossDistance : lastPrice + stopLossDistance;
        // Take-profit is still a simple multiple of the AI's suggested risk.
        const rawTakeProfitPrice = (signal === 'LONG') ? lastPrice + (stopLossDistance * this.takeProfitMultiplier) : lastPrice - (stopLossDistance * this.takeProfitMultiplier);
        
        const finalStopLossPrice = Math.round(rawStopLossPrice);
        const finalTakeProfitPrice = Math.round(rawTakeProfitPrice);

        const tradeParams = {
            size: parseFloat(positionSizeInBTC.toFixed(4)),
            stopLoss: finalStopLossPrice,
            takeProfit: finalTakeProfitPrice,
        };
        
        log.info(`[RISK] Final Trade Params: ${JSON.stringify(tradeParams)}`);
        log.info("[RISK] --- Risk Calculation Complete ---");
        
        return tradeParams;
    }
}
