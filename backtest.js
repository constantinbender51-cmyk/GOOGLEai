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
// We have 900 calls/day. Let's be safe and aim for one call every 2 minutes (120 seconds).
// 900 calls / day = ~37.5 calls / hour = ~0.625 calls / minute.
// 1 call / 1.6 minutes = 96 seconds. Let's use 100 seconds to be safe.
const MIN_SECONDS_BETWEEN_CALLS = 100; 

async function runBacktest() {
    log.info('--- STARTING NEW BACKTEST (Real-Time Simulation) ---');
    log.info(`Rate limit set to 1 AI call per ${MIN_SECONDS_BETWEEN_CALLS} seconds.`);

    const dataHandler = new BacktestDataHandler(DATA_FILE_PATH);
    const executionHandler = new BacktestExecutionHandler();
    const strategyEngine = new StrategyEngine();
    const riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });

    let simulatedAccount = { balance: INITIAL_BALANCE };
    let apiCallCount = 0;

    while (true) {
        const loopStartTime = Date.now(); // Record start time of the loop

        const marketData = dataHandler.fetchAllData();
        if (!marketData) {
            log.info('[BACKTEST] End of historical data reached.');
            break;
        }

        const currentCandle = marketData.ohlc[marketData.ohlc.length - 1];
        const openTrade = executionHandler.getOpenTrade();

        // --- Trade Closing Logic (remains the same) ---
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

        // --- Trade Opening Logic (now with rate limiting) ---
        if (!executionHandler.getOpenTrade()) {
            // For this "real-time" simulation, we call the AI on every candle.
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

            // --- Strict Rate Limiting Logic ---
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
    log.info('--- BACKTEST COMPLETE ---');
    // ... (The existing results reporting is perfect)
    const totalTrades = executionHandler.trades.length;
    const winningTrades = executionHandler.trades.filter(t => t.pnl > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const finalBalance = simulatedAccount.balance;
    const totalPnl = finalBalance - INITIAL_BALANCE;

    console.log("\n\n--- Backtest Performance Summary ---");
    console.log(`Initial Balance: $${INITIAL_BALANCE.toFixed(2)}`);
    console.log(`Final Balance:   $${finalBalance.toFixed(2)}`);
    console.log(`Total P&L:       $${totalPnl.toFixed(2)}`);
    console.log(`------------------------------------`);
    console.log(`Total Trades:    ${totalTrades}`);
    console.log(`Winning Trades:  ${winningTrades}`);
    console.log(`Losing Trades:   ${losingTrades}`);
    console.log(`Win Rate:        ${winRate.toFixed(2)}%`);
    console.log(`------------------------------------`);
    console.log(`Total AI API Calls: ${apiCallCount}`);
    console.log("\n");
}

runBacktest().catch(err => {
    log.error('[BACKTEST] A critical error occurred during the backtest.', err);
});
