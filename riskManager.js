// riskManager.js

/**
 * @class RiskManager
 * @description Handles position sizing and risk control for trades.
 */
export class RiskManager {
    /**
     * @param {object} config - Configuration for the risk manager.
     * @param {number} [config.riskPercentage=1.0] - The percentage of total equity to risk per trade (e.g., 1.0 for 1%).
     * @param {number} [config.stopLossMultiplier=2.0] - A factor to calculate the stop-loss based on volatility (e.g., 2x ATR).
     * @param {number} [config.takeProfitMultiplier=3.0] - A factor to calculate the take-profit based on the stop-loss (e.g., 3x the risk).
     */
    constructor(config = {}) {
        this.riskPercentage = config.riskPercentage || 1.0;
        this.stopLossMultiplier = config.stopLossMultiplier || 2.0;
        this.takeProfitMultiplier = config.takeProfitMultiplier || 3.0;

        console.log("RiskManager initialized with the following settings:");
        console.log(`- Risk per trade: ${this.riskPercentage}%`);
        console.log(`- Stop-Loss Multiplier: ${this.stopLossMultiplier}`);
        console.log(`- Take-Profit Multiplier: ${this.takeProfitMultiplier}`);
    }

    /**
     * Calculates the Average True Range (ATR) as a measure of market volatility.
     * @private
     * @param {Array<object>} ohlcData - An array of OHLC candles.
     * @param {number} period - The lookback period for the ATR calculation (e.g., 14).
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
     * Calculates trade parameters based on the signal, account balance, and risk settings.
     * @param {object} marketData - The consolidated data from the DataHandler.
     * @param {object} tradingSignal - The signal object from the StrategyEngine (e.g., { signal: 'LONG' }).
     * @returns {object|null} An object with trade parameters (size, stopLoss, takeProfit) or null if no trade should be made.
     */
    calculateTradeParameters(marketData, tradingSignal) {
        const { signal } = tradingSignal;
        const { balance, ohlc } = marketData;
        const lastPrice = ohlc[ohlc.length - 1].close;

        // Do not proceed if the signal is to HOLD
        if (signal === 'HOLD') {
            return null;
        }

        // Use the cash balance for calculations. Assumes a cash-collateralized account (e.g., USD).
        // You might need to adjust this depending on your account's collateral currency.
        const accountEquity = balance.accounts?.mc; // 'mc' is often margin cash
        if (!accountEquity) {
            console.error("RiskManager: Could not determine account equity from balance data.");
            return null;
        }

        // 1. Calculate the amount to risk in USD
        const amountToRisk = accountEquity * (this.riskPercentage / 100);

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

        // 3. Calculate Position Size
        // The size is the total amount you can risk divided by how much you lose per contract if the stop is hit.
        const dollarsPerPoint = 1; // For XBT/USD perpetuals, 1 contract = 1 USD. Adjust if needed.
        const positionSize = Math.floor((amountToRisk / stopLossDistance) * dollarsPerPoint);

        if (positionSize <= 0) {
            console.warn("RiskManager: Calculated position size is zero or negative. Skipping trade.");
            return null;
        }

        // 4. Calculate Take-Profit
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
        
        console.log("--- Risk Calculation Complete ---");
        console.log(`- Account Equity: $${accountEquity.toFixed(2)}`);
        console.log(`- Amount to Risk: $${amountToRisk.toFixed(2)}`);
        console.log(`- Volatility (ATR): ${atr.toFixed(2)}`);
        console.log(`- Stop Distance: ${stopLossDistance.toFixed(2)}`);
        console.log("Calculated Trade Parameters:", tradeParams);
        
        return tradeParams;
    }
}
