// backtestRunner.js

// --- FIX: Added import statements ---
import { log } from './logger.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';
import { calculateIndicatorSeries } from './indicators.js';

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
        
        await this.dataHandler.load();

        const allCandles = this.dataHandler.getAllCandles();
        if (!allCandles || allCandles.length < this.config.WARMUP_PERIOD) {
            throw new Error("Not enough data for the warm-up period.");
        }
        
        let apiCallCount = 0;

        for (let i = this.config.WARMUP_PERIOD; i < allCandles.length; i++) {
            const currentCandle = allCandles[i];
            
            const openTrade = this.executionHandler.getOpenTrade();
            if (openTrade) {
                this._checkTradeExit(currentCandle, openTrade);
            }

            if (!this.executionHandler.getOpenTrade()) {
                
                // --- FIX: We are re-adding the rate limiting logic from our previous working version ---
                const loopStartTime = Date.now();

                if (apiCallCount >= this.config.MAX_API_CALLS) {
                    log.info(`[BACKTEST] Reached the API call limit of ${this.config.MAX_API_CALLS}. Ending simulation.`);
                    break;
                }
                apiCallCount++;
                log.info(`[BACKTEST] [Call #${apiCallCount}/${this.config.MAX_API_CALLS}] Analyzing candle...`);
                // --- END FIX ---

                // --- ASSEMBLE THE CHIMERA DATA PAYLOAD ---
                const ohlc_1h = allCandles.slice(i - this.config.DATA_WINDOW_SIZE, i);
                const ohlc_15m = await this.dataHandler.fetchRecentData(
                    'candles_15m',
                    currentCandle.timestamp,
                    48 * 60 * 60
                );

                const marketData = {
                    current_utc_timestamp: new Date(currentCandle.timestamp * 1000).toISOString(),
                    order_book_l2: { bids: [], asks: [] },
                    ohlc_1h: ohlc_1h,
                    ohlc_15m: ohlc_15m,
                    funding_rates: [],
                    open_interest_delta: [],
                    social_sentiment: [],
                    spot_futures_basis: 0.0,
                    whale_wallet_flow: 0.0,
                    implied_volatility: {}
                };

                const tradePlan = await this.strategyEngine.generateSignal(marketData);

                if (tradePlan.signal !== 'HOLD' && tradePlan.confidence >= this.config.MINIMUM_CONFIDENCE_THRESHOLD) {
                    // This part needs the risk manager to calculate size correctly
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
                }

                // --- FIX: We are re-adding the wait/delay logic ---
                const loopEndTime = Date.now();
                const processingTimeMs = loopEndTime - loopStartTime;
                const delayNeededMs = (this.config.MIN_SECONDS_BETWEEN_CALLS * 1000) - processingTimeMs;
                if (delayNeededMs > 0) {
                    log.info(`[RATE_LIMIT] Waiting for ${delayNeededMs.toFixed(0)}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayNeededMs));
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
        
        // --- THIS IS THE FIX ---
        // We must ensure we are using the correct marketData object
        // that contains ALL the necessary pieces.
        
        // 1. Calculate the indicators from the 1h data that was passed in.
        const indicators_1h = calculateIndicatorSeries(marketData.ohlc_1h);
        
        // 2. Assemble the complete payload for the AI.
        // This object contains EVERYTHING the AI needs.
        const marketDataForAI = {
            current_utc_timestamp: marketData.current_utc_timestamp,
            ohlc_1h: marketData.ohlc_1h,
            indicators_1h: indicators_1h, // The calculated indicators
            ohlc_15m: marketData.ohlc_15m,
            order_book_l2: marketData.order_book_l2,
            funding_rates: marketData.funding_rates,
            open_interest_delta: marketData.open_interest_delta,
            social_sentiment: marketData.social_sentiment,
            spot_futures_basis: marketData.spot_futures_basis,
            whale_wallet_flow: marketData.whale_wallet_flow,
            implied_volatility: marketData.implied_volatility
        };

        // 3. Pass THIS specific object to the strategy engine.
        const tradePlan = await this.strategyEngine.generateSignal(marketDataForAI);
        
        // 4. Now, validate and execute the trade plan.
        if (
            tradePlan &&
            tradePlan.signal &&
            tradePlan.signal !== 'HOLD' &&
            tradePlan.confidence >= this.config.MINIMUM_CONFIDENCE_THRESHOLD &&
            tradePlan.entry_price &&
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
