// riskManager.js

// ... (constructor and _calculateATR are the same)

    /**
     * Calculates trade parameters based on the signal, account balance, and risk settings.
     * @param {object} marketData - The consolidated data from the DataHandler.
     * @param {object} tradingSignal - The signal object from the StrategyEngine.
     * @returns {object|null} An object with trade parameters or null.
     */
    calculateTradeParameters(marketData, tradingSignal) {
        const { signal } = tradingSignal;
        const { balance, ohlc } = marketData; // `balance` is now a number
        const lastPrice = ohlc[ohlc.length - 1].close;

        if (signal === 'HOLD') {
            return null;
        }

        // The account equity is now directly the balance we fetched.
        const accountEquity = balance;
        if (typeof accountEquity !== 'number' || accountEquity <= 0) {
            console.error("RiskManager: Invalid account equity provided. Must be a positive number.");
            return null;
        }

        // 1. Calculate the amount to risk in USD
        const amountToRisk = accountEquity * (this.riskPercentage / 100);

        // ... (The rest of the function for calculating stop-loss, size, and take-profit remains exactly the same)
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

        const dollarsPerPoint = 1;
        const positionSize = Math.floor((amountToRisk / stopLossDistance) * dollarsPerPoint);

        if (positionSize <= 0) {
            console.warn("RiskManager: Calculated position size is zero or negative. Skipping trade.");
            return null;
        }

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
