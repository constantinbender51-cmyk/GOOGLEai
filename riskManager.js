// riskManager.js

/**
 * @class RiskManager
 * @description Handles position sizing and risk control for trades.
 */
export class RiskManager {
    /**
     * @param {object} config - Configuration for the risk manager.
     * @param {number} [config.leverage=10] - The desired leverage to use for trades.
     * @param {number} [config.stopLossMultiplier=2.0] - A factor to calculate the stop-loss based on volatility (e.g., 2x ATR).
     * @param {number} [config.takeProfitMultiplier=3.0] - A factor to calculate the take-profit based on the stop-loss (e.g., 3x the risk).
     */
    constructor(config = {}) {
        // We no longer need riskPercentage, we will use leverage instead.
        this.leverage = config.leverage || 10;
        this.stopLossMultiplier = config.stopLossMultiplier || 2.0;
        this.takeProfitMultiplier = config.takeProfitMultiplier || 3.0;

        console.log("RiskManager initialized with the following settings:");
        console.log(`- Desired Leverage: ${this.leverage}x`);
        console.log(`- Stop-Loss Multiplier (from ATR): ${this.stopLossMultiplier}`);
        console.log(`- Take-Profit Multiplier (Risk/Reward): ${this.takeProfitMultiplier}`);
    }

    /**
     * Calculates the Average True Range (ATR) as a measure of market volatility.
     * @private
     * @param {Array<object>} ohlcData - An array of OHLC candles.
     * @param {number} period - The lookback period for the ATR calculation.
     * @returns {number} The ATR value.
     */
    _calculateATR(ohlcData, period = 14) {
        if (ohlcData.length < period) {
            console.warn("Not enough OHLC data to calculate ATR. Volatility will be underestimated.");
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
        
        const averageTrueRange = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
        return averageTrueRange;
    }

    /**
     * Calculates trade parameters based on leverage and volatility-based stops.
     * @param {object} marketData - The consolidated data from the DataHandler.
     * @param {object} tradingSignal - The signal object from the StrategyEngine.
     * @returns {object|null} An object with trade parameters or null.
     */
    calculateTradeParameters(marketData, tradingSignal) {
        const { signal } = tradingSignal;
        const { balance, ohlc } = marketData;
        const lastPrice = ohlc[ohlc.length - 1].close;

        if (signal === 'HOLD') {
            return null;
        }

        const accountEquity = balance;
        if (typeof accountEquity !== 'number' || accountEquity <= 0) {
            console.error("RiskManager: Invalid account equity provided. Must be a positive number.");
            return null;
        }

        // 1. Calculate Position Size based on Leverage
        // The position size is the total notional value of the trade.
        const positionSize = Math.floor(accountEquity * this.leverage);

        if (positionSize <= 0) {
            console.warn("RiskManager: Calculated position size is zero or negative based on leverage. Skipping trade.");
            return null;
        }

        // 2. Calculate Stop-Loss based on volatility (ATR)
        const atr = this._calculateATR(ohlc);
        if (atr === 0) {
            console.error("RiskManager: ATR is zero, cannot calculate a valid stop-loss.");
            return null;
        }
        const stopLossDistance = atr * this.stopLossMultiplier;
        
        let stopLossPrice;
        if (signal === 'LONG') {
            stopLossPrice = lastPrice - stopLossDistance;
        } else { // SHORT
            stopLossPrice = lastPrice + stopLossDistance;
        }

        // 3. Calculate Take-Profit based on Risk/Reward
        const riskRewardRatio = this.takeProfitMultiplier;
        let takeProfitPrice;
        if (signal === 'LONG') {
            takeProfitPrice = lastPrice + (stopLossDistance * riskRewardRatio);
        } else { // SHORT
            takeProfitPrice = lastPrice - (stopLossDistance * riskRewardRatio);
        }

        const tradeParams = {
            size: positionSize,
            stopLoss: parseFloat(stopLossPrice.toFixed(2)),
            takeProfit: parseFloat(takeProfitPrice.toFixed(2)),
        };
        
        console.log("--- Risk Calculation Complete (Leverage Model) ---");
        console.log(`- Account Equity: $${accountEquity.toFixed(2)}`);
        console.log(`- Desired Leverage: ${this.leverage}x`);
        console.log(`- Calculated Position Size: $${positionSize}`);
        console.log("Calculated Trade Parameters:", tradeParams);
        
        return tradeParams;
    }
}
