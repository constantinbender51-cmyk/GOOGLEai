// backtest.js

import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';
import { log } from './logger.js';

// --- Backtest Configuration ---
const INITIAL_BALANCE = 10000;
const MINIMUM_CONFIDENCE_THRESHOLD = 70;
const DATA_FILE_PATH = './data/XBTUSD_60m_data.csv';
const MIN_SECONDS_BETWEEN_CALLS = 100;
const DATA_WINDOW_SIZE = 720;
const WARMUP_PERIOD = DATA_WINDOW_SIZE;

async function runBacktest() {
    log.info('--- STARTING NEW BACKTEST (Correct Rate Limiting) ---');
    await ensureDataFileExists(); // This function is defined further down

    const dataHandler = new BacktestDataHandler(DATA_FILE_PATH);
    const executionHandler = new BacktestExecutionHandler();
    const strategyEngine = new StrategyEngine();
    const riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });

    let simulatedAccount = { balance: INITIAL_BALANCE };
    let apiCallCount = 0;

    log.info(`[BACKTEST] Warming up with ${WARMUP_PERIOD} candles...`);
    for (let i = 0; i < WARMUP_PERIOD; i++) {
        if (!dataHandler.fetchAllData()) {
            throw new Error("Not enough data for the warm-up period.");
        }
    }
    log.info('[BACKTEST] Warm-up complete. Starting simulation.');

    // --- MAIN SIMULATION LOOP ---
    while (true) {
        const marketData = dataHandler.fetchAllData();
        if (!marketData) {
            log.info('[BACKTEST] End of historical data reached.');
            break;
        }
        
        const currentCandle = marketData.ohlc[marketData.ohlc.length - 1];
        const openTrade = executionHandler.getOpenTrade();

        // --- Trade Closing Logic (runs on every candle, instantly) ---
        if (openTrade) {
            // ... (The existing trade closing logic is perfect)
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
                const pnl = (exitPrice - openTrade.entryPrice) * openTrade.size * (openTrade.signal === 'LONG' ? 1 : -1);
                simulatedAccount.balance += pnl;
                openTrade.status = 'closed'; openTrade.exitPrice = exitPrice; openTrade.exitTime = currentCandle.timestamp; openTrade.pnl = pnl;
                log.info(`[BACKTEST] ---- TRADE CLOSED via ${exitReason} ----`);
                log.info(`[BACKTEST] Exit: ${exitPrice} | P&L: $${pnl.toFixed(2)} | New Balance: $${simulatedAccount.balance.toFixed(2)}`);
            }
        }

        // --- Trade Opening Logic (only runs if no trade is open) ---
        if (!executionHandler.getOpenTrade()) {
            const loopStartTime = Date.now(); // Start timing right before the API call

            apiCallCount++;
            log.info(`[BACKTEST] [Call #${apiCallCount}] Analyzing candle for ${new Date(currentCandle.timestamp * 1000).toISOString()}`);
            
            const tradingSignal = await strategyEngine.generateSignal(marketData);

            if (tradingSignal.signal !== 'HOLD' && tradingSignal.confidence >= MINIMUM_CONFIDENCE_THRESHOLD) {
                const tradeParams = riskManager.calculateTradeParameters({ ...marketData, balance: simulatedAccount.balance }, tradingSignal);
                if (tradeParams && tradeParams.size > 0) {
                    executionHandler.placeOrder({
                        signal: tradingSignal.signal,
                        params: tradeParams,
                        entryPrice: currentCandle.close,
                        entryTime: currentCandle.timestamp,
                    });
                }
            }

            // --- THE FIX: Rate Limiting Logic is MOVED INSIDE this block ---
            const loopEndTime = Date.now();
            const processingTimeMs = loopEndTime - loopStartTime;
            const delayNeededMs = (MIN_SECONDS_BETWEEN_CALLS * 1000) - processingTimeMs;

            if (delayNeededMs > 0) {
                log.info(`[BACKTEST] Processing took ${processingTimeMs}ms. Waiting for ${delayNeededMs}ms to respect rate limit...`);
                await new Promise(resolve => setTimeout(resolve, delayNeededMs));
            } else {
                log.warn(`[BACKTEST] Warning: AI call and processing took longer (${processingTimeMs}ms) than the rate limit interval.`);
            }
        }
    }

    // --- Final Results ---
    // ... (The existing results reporting is perfect)
}

// ... (ensureDataFileExists function)

// Run the script
runBacktest().catch(err => {
    log.error('[BACKTEST] A critical error occurred.', err);
});
