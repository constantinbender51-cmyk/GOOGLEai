// backtestRunner.js

// --- FIX: Added import statements ---
import { log } from './logger.js';
import { EMA } from 'technicalindicators';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';

// --- FIX: Added export statement ---
export class BacktestRunner {
    constructor(config) {
        this.config = config;
        this.dataHandler = new BacktestDataHandler(config.DATA_FILE_PATH);
        this.executionHandler = new BacktestExecutionHandler(config.INITIAL_BALANCE);
        this.strategyEngine = new StrategyEngine();
        this.riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });
        log.info('BacktestRunner initialized.');
    }

    async run() {
        log.info('--- STARTING NEW BACKTEST (WITH MA FILTER) ---');
        
        const allCandles = this.dataHandler.getAllCandles();
        if (!allCandles || allCandles.length < this.config.WARMUP_PERIOD) {
            throw new Error("Not enough data for the warm-up period.");
        }

        let apiCallCount = 0;

        for (let i = this.config.WARMUP_PERIOD; i < allCandles.length; i++) {
            const currentCandle = allCandles[i];
            const marketData = { ohlc: allCandles.slice(i - this.config.DATA_WINDOW_SIZE, i) };

            const openTrade = this.executionHandler.getOpenTrade();
            if (openTrade) {
                this._checkTradeExit(currentCandle, openTrade);
            }

            if (!this.executionHandler.getOpenTrade()) {
                const signalFound = this._checkForSignal(marketData);
                if (signalFound) {
                    if (apiCallCount >= this.config.MAX_API_CALLS) {
                        log.info(`[BACKTEST] Reached the API call limit. Ending simulation.`);
                        break;
                    }
                    apiCallCount++;
                    await this._handleSignal(marketData, currentCandle, apiCallCount);
                }
            }
        }
        this._printSummary(apiCallCount);
    }

    _checkTradeExit(currentCandle, openTrade) {
        let exitPrice = null;
        let exitReason = '';
        if (openTrade.signal === 'LONG') {
            if (currentCandle.low <= openTrade.stopLoss) { exitPrice = openTrade.stopLoss; exitReason = 'Stop-Loss'; }
            else if (currentCandle.high >= openTrade.takeProfit) { exitPrice = openTrade.takeProfit; exitReason = 'Take-Profit'; }
        } else if (openTrade.signal === 'SHORT') {
            if (currentCandle.high >= openTrade.stopLoss) { exitPrice = openTrade.stopLoss; exitReason = 'Stop-Loss'; }
            else if (currentCandle.low <= openTrade.takeProfit) { exitPrice = openTrade.takeProfit; exitReason = 'Take-Profit'; }
        }
        if (exitPrice) {
            this.executionHandler.closeTrade(openTrade, exitPrice, currentCandle.timestamp);
        }
    }

    _checkForSignal(marketData) {
        const closePrices = marketData.ohlc.map(c => c.close);
        const fastEMA = EMA.calculate({ period: 12, values: closePrices });
        const slowEMA = EMA.calculate({ period: 26, values: closePrices });
        const lastFast = fastEMA[fastEMA.length - 1];
        const prevFast = fastEMA[fastEMA.length - 2];
        const lastSlow = slowEMA[slowEMA.length - 1];
        const prevSlow = slowEMA[slowEMA.length - 2];
        const isBullishCrossover = prevFast <= prevSlow && lastFast > lastSlow;
        const isBearishCrossover = prevFast >= prevSlow && lastFast < lastSlow;
        if (isBullishCrossover || isBearishCrossover) {
            log.info(`[FILTER] Potential signal found: ${isBullishCrossover ? 'Bullish' : 'Bearish'} Crossover.`);
            return true;
        }
        return false;
    }

    async _handleSignal(marketData, currentCandle, apiCallCount) {
        log.info(`[BACKTEST] [Call #${apiCallCount}/${this.config.MAX_API_CALLS}] Analyzing crossover event...`);
        const loopStartTime = Date.now();
        
        const tradingSignal = await this.strategyEngine.generateSignal(marketData);

        if (tradingSignal.signal !== 'HOLD' && tradingSignal.confidence >= this.config.MINIMUM_CONFIDENCE_THRESHOLD) {
            const tradeParams = this.riskManager.calculateTradeParameters({ ...marketData, balance: this.executionHandler.balance }, tradingSignal);
            if (tradeParams && tradeParams.size > 0) {
                this.executionHandler.placeOrder({
                    signal: tradingSignal.signal,
                    params: tradeParams,
                    entryPrice: currentCandle.close,
                    entryTime: currentCandle.timestamp,
                    reason: tradingSignal.reason
                });
            }
        }

        const processingTimeMs = Date.now() - loopStartTime;
        const delayNeededMs = (this.config.MIN_SECONDS_BETWEEN_CALLS * 1000) - processingTimeMs;
        if (delayNeededMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayNeededMs));
        }
    }

    _printSummary(apiCallCount) {
        // ... (This function is correct and unchanged)
    }
}
