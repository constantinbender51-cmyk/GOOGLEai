// riskManager.js

/**
 * @class RiskManager
 * @description Handles position sizing for BTC-denominated contracts like PF_XBTUSD.
 */
export class RiskManager {
    constructor(config = {}) {
        this.leverage = config.leverage || 10;
        this.stopLossMultiplier = config.stopLossMultiplier || 2.0;
        this.takeProfitMultiplier = config.takeProfitMultiplier || 3.0;

        console.log("RiskManager initialized for BTC-DENOMINATED contracts (PF_XBTUSD):");
        console.log(`- Desired Leverage: ${this.leverage}x`);
    }

    _calculateATR(ohlcData, period = 14) {
        // This helper function remains the same
        if (ohlcData.length < period) {
            console.warn("Not enough OHLC data to calculate ATR.");
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
            console.error("RiskManager: Invalid account equity (USD). Must be a positive number.");
            return null;
        }

        // 1. Calculate the total desired notional value of the position in USD.
        const notionalValueUSD = accountEquityUSD * this.leverage;

        // 2. Convert the USD notional value to the BTC order size.
        // This is the CRITICAL correction based on your information.
        if (lastPrice <= 0) {
            console.error("RiskManager: Invalid last price, cannot convert to BTC size.");
            return null;
        }
        const positionSizeInBTC = notionalValueUSD / lastPrice;

        // We don't Math.floor() here, as we need the precision. The exchange will handle lot sizes.
        
        if (positionSizeInBTC <= 0) {
            console.warn("RiskManager: Calculated BTC position size is zero. Skipping trade.");
            return null;
        }

        // 3. Calculate Stop-Loss and Take-Profit (this logic is unaffected)
        const atr = this._calculateATR(ohlc);
        if (atr === 0) {
            console.error("RiskManager: ATR is zero, cannot calculate a valid stop-loss.");
            return null;
        }
        const stopLossDistance = atr * this.stopLossMultiplier;
        
        const stopLossPrice = (signal === 'LONG') 
            ? lastPrice - stopLossDistance 
            : lastPrice + stopLossDistance;

        const takeProfitPrice = (signal === 'LONG')
            ? lastPrice + (stopLossDistance * this.takeProfitMultiplier)
            : lastPrice - (stopLossDistance * this.takeProfitMultiplier);

        const tradeParams = {
            size: parseFloat(positionSizeInBTC.toFixed(4)), // Use toFixed for reasonable precision, matching Min Lot.
            stopLoss: parseFloat(stopLossPrice.toFixed(2)),
            takeProfit: parseFloat(takeProfitPrice.toFixed(2)),
        };
        
        console.log("--- Risk Calculation Complete (BTC-Denominated Model) ---");
        console.log(`- Account Equity (USD): $${accountEquityUSD.toFixed(2)}`);
        console.log(`- Desired Leverage: ${this.leverage}x`);
        console.log(`- Notional Value (USD): $${notionalValueUSD.toFixed(2)}`);
        console.log(`- Current BTC Price: $${lastPrice}`);
        console.log(`- Calculated Position Size (BTC): ${tradeParams.size}`);
        console.log("Calculated Trade Parameters:", tradeParams);
        
        return tradeParams;
    }
    }
