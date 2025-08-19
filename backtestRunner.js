// backtestRunner.js

// --- FIX: Added import statements ---
import { log } from './logger.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';

// --- FIX: Added export statement ---
export class BacktestRunner {
    constructor(config) {
        this.config = config;
        this.dataHandler = new BacktestDataHandler();
        this.executionHandler = new BacktestExecutionHandler(config.INITIAL_BALANCE);
        this.strategyEngine = new StrategyEngine();
        this.riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });
        log.info('BacktestRunner initialized.');
    }

    async run() {
        log.info('--- STARTING NEW DATABASE-POWERED BACKTEST ---');
        
        // --- THE KEY CHANGE: Await the data loading ---
        await this.dataHandler.load();

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
                // --- ASSEMBLE THE CHIMERA DATA PAYLOAD ---
                // 1. Get 1h data
                const ohlc_1h = allCandles.slice(i - this.config.DATA_WINDOW_SIZE, i);
                
                // 2. Get 15m data on-demand
                const ohlc_15m = await this.dataHandler.fetchRecentData(
                    'candles_15m',
                    currentCandle.timestamp,
                    48 * 60 * 60 // 48 hours in seconds
                );

                // 3. Mock the other data sources for now
                const marketData = {
                    current_utc_timestamp: new Date(currentCandle.timestamp * 1000).toISOString(),
                    order_book_l2: { bids: [], asks: [] }, // Mocked
                    ohlc_1h: ohlc_1h,
                    ohlc_15m: ohlc_15m,
                    funding_rates: [], // Mocked
                    open_interest_delta: [], // Mocked
                    social_sentiment: [], // Mocked
                    spot_futures_basis: 0.0, // Mocked
                    whale_wallet_flow: 0.0, // Mocked
                    implied_volatility: {} // Mocked
                };

                // --- GET THE AI'S FULL TRADE PLAN ---
                const tradePlan = await this.strategyEngine.generateSignal(marketData);

                if (tradePlan.signal !== 'HOLD' && tradePlan.confidence >= this.config.MINIMUM_CONFIDENCE_THRESHOLD) {
                    
                    // --- The AI now gives us the full plan, we just need to execute it ---
                    // We can add a sanity check here later
                    
                    this.executionHandler.placeOrder({
                        signal: tradePlan.signal,
                        entryPrice: tradePlan.entry_price,
                        stopLoss: tradePlan.stop_loss_price,
                        takeProfit: tradePlan.take_profit_price,
                        reason: tradePlan.reason,
                        // We'll need to calculate size separately
                        size: 100 / tradePlan.entry_price // Placeholder size
                    });
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
        const LOOKBACK_PERIOD = 20; // A common period for breakout strategies

        // Ensure we have enough data for the lookback
        if (marketData.ohlc.length < LOOKBACK_PERIOD + 1) {
            return false;
        }

        // The current candle is the last one in the window
        const currentCandle = marketData.ohlc[marketData.ohlc.length - 1];
        
        // The "lookback window" is the 20 candles *before* the current one
        const lookbackWindow = marketData.ohlc.slice(
            marketData.ohlc.length - LOOKBACK_PERIOD - 1, 
            marketData.ohlc.length - 1
        );

        // Find the highest high and lowest low in that lookback window
        const highestHigh = Math.max(...lookbackWindow.map(c => c.high));
        const lowestLow = Math.min(...lookbackWindow.map(c => c.low));

        // Check for a breakout
        const isBullishBreakout = currentCandle.high > highestHigh;
        const isBearishBreakout = currentCandle.low < lowestLow;

        if (isBullishBreakout) {
            log.info(`[FILTER] Potential signal found: Bullish Breakout above ${highestHigh}.`);
            return true;
        }
        if (isBearishBreakout) {
            log.info(`[FILTER] Potential signal found: Bearish Breakout below ${lowestLow}.`);
            return true;
        }

        return false; // No breakout, no signal
    }
    async _handleSignal(marketData, currentCandle, apiCallCount) {
        log.info(`[BACKTEST] [Call #${apiCallCount}/${this.config.MAX_API_CALLS}] Analyzing event...`);
        const loopStartTime = Date.now();
        
        const tradePlan = await this.strategyEngine.generateSignal(marketData);

        // --- THIS IS THE FIX ---
        // We must validate the entire tradePlan object before using it.
        // The AI might return a minimal object on failure.
        if (
            tradePlan &&
            tradePlan.signal &&
            tradePlan.signal !== 'HOLD' &&
            trade.confidence >= this.config.MINIMUM_CONFIDENCE_THRESHOLD &&
            tradePlan.entry_price && // Check for all required fields
            tradePlan.stop_loss_price &&
            tradePlan.take_profit_price
        ) {
            const positionSize = this.riskManager.calculatePositionSize(this.executionHandler.balance, tradePlan);

            if (positionSize && positionSize > 0) {
                this.executionHandler.placeOrder({
                    signal: tradePlan.signal,
                    entryPrice: tradePlan.entry_price,
                    stopLoss: tradePlan.stop_loss_price,
                    takeProfit: tradePlan.take_profit_price,
                    reason: tradePlan.reason,
                    size: positionSize
                });
            }
        } else {
            // This block now handles cases where the AI returned HOLD or an incomplete object.
            log.info(`[BACKTEST] AI returned HOLD or an invalid trade plan. No action taken.`);
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
