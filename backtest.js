import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';
import { log } from './logger.js';

// --- Backtest Configuration ---
const INITIAL_BALANCE = 10000; // Start with a simulated $10,000
const MINIMUM_CONFIDENCE_THRESHOLD = 70; // Use the same threshold as the live bot
const DATA_FILE_PATH = './data/XBTUSD_60m_data.csv';

async function runBacktest() {
    log.info('--- STARTING NEW BACKTEST ---');

    // 1. Initialize all our modules
    const dataHandler = new BacktestDataHandler(DATA_FILE_PATH);
    const executionHandler = new BacktestExecutionHandler();
    const strategyEngine = new StrategyEngine();
    const riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });

    let simulatedAccount = { balance: INITIAL_BALANCE };

    // 2. The Main Simulation Loop
    while (true) {
        const marketData = dataHandler.fetchAllData();
        if (!marketData) {
            log.info('[BACKTEST] End of historical data reached.');
            break; // Exit the loop when data runs out
        }

        const currentCandle = marketData.ohlc[marketData.ohlc.length - 1];
        const openTrade = executionHandler.getOpenTrade();

        // 3. Check if an open trade should be closed
        if (openTrade) {
            let exitPrice = null;
            let exitReason = '';

            if (openTrade.signal === 'LONG') {
                if (currentCandle.low <= openTrade.stopLoss) {
                    exitPrice = openTrade.stopLoss;
                    exitReason = 'Stop-Loss';
                } else if (currentCandle.high >= openTrade.takeProfit) {
                    exitPrice = openTrade.takeProfit;
                    exitReason = 'Take-Profit';
                }
            } else if (openTrade.signal === 'SHORT') {
                if (currentCandle.high >= openTrade.stopLoss) {
                    exitPrice = openTrade.stopLoss;
                    exitReason = 'Stop-Loss';
                } else if (currentCandle.low <= openTrade.takeProfit) {
                    exitPrice = openTrade.takeProfit;
                    exitReason = 'Take-Profit';
                }
            }

            if (exitPrice) {
                // A trade was closed
                const pnl = (exitPrice - openTrade.entryPrice) * openTrade.size * (openTrade.signal === 'LONG' ? 1 : -1);
                simulatedAccount.balance += pnl;
                openTrade.status = 'closed';
                openTrade.exitPrice = exitPrice;
                openTrade.exitTime = currentCandle.timestamp;
                openTrade.pnl = pnl;

                log.info(`[BACKTEST] ---- TRADE CLOSED via ${exitReason} ----`);
                log.info(`[BACKTEST] Exit: ${exitPrice} | P&L: $${pnl.toFixed(2)} | New Balance: $${simulatedAccount.balance.toFixed(2)}`);
            }
        }

        // 4. Check if a new trade should be opened (only if no trade is currently open)
        if (!executionHandler.getOpenTrade()) {
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
        }
    }

    // 5. Print Final Results
    log.info('--- BACKTEST COMPLETE ---');
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
    console.log("------------------------------------\n");
}

runBacktest().catch(err => {
    log.error('[BACKTEST] A critical error occurred during the backtest.', err);
});
