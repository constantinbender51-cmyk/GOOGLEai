// backtest.js

import fs from 'fs';
import axios from 'axios';
import { Parser as Json2CsvParser } from 'json2csv';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';
import { log } from './logger.js';
import { EMA } from 'technicalindicators'; // <-- IMPORT EMA

// --- Configuration ---
const DATA_FILE_PATH = './data/XBTUSD_60m_data.csv';
const INITIAL_BALANCE = 10000;
const MINIMUM_CONFIDENCE_THRESHOLD = 40;
const MIN_SECONDS_BETWEEN_CALLS = 60;
const MAX_API_CALLS = 500; // Increased for the filtered run
const DATA_WINDOW_SIZE = 720;
const WARMUP_PERIOD = DATA_WINDOW_SIZE;

// ==================================================================================
// SECTION 1: DATA FETCHING LOGIC (Unaltered)
// ==================================================================================
const BINANCE_PAIR = 'BTCUSDT';
const INTERVAL = '1h';
const START_DATE = '2022-01-01T00:00:00Z';
const BATCH_SIZE = 1000;

async function fetchBinanceOHLC(symbol, interval, startTime, limit) {
    const url = 'https://api.binance.com/api/v3/klines';
    const params = { symbol, interval, startTime, limit };
    try {
        const response = await axios.get(url, { params });
        return response.data.map(kline => ({
            timestamp: Math.floor(kline[0] / 1000),
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
        }));
    } catch (error) {
        log.error(`Failed to fetch Binance OHLC data. ${error.message}`);
        throw error;
    }
}

async function ensureDataFileExists() {
    if (fs.existsSync(DATA_FILE_PATH)) {
        log.info(`[DATA] Data file already exists at ${DATA_FILE_PATH}. Skipping download.`);
        return;
    }
    log.info(`[DATA] Data file not found. Starting download from Binance...`);
    let allCandles = [];
    let startTime = new Date(START_DATE).getTime();
    const endTime = Date.now();
    while (startTime < endTime) {
        log.info(`[DATA] Fetching data from ${new Date(startTime).toISOString()}...`);
        try {
            const candles = await fetchBinanceOHLC(BINANCE_PAIR, INTERVAL, startTime, BATCH_SIZE);
            if (candles.length === 0) break;
            allCandles.push(...candles);
            startTime = candles[candles.length - 1].timestamp * 1000 + 1;
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            log.error("[DATA] Stopping fetch loop due to an error.");
            break;
        }
    }
    log.info(`[DATA] Download complete. Total candles fetched: ${allCandles.length}.`);
    if (allCandles.length > 0) {
        const uniqueCandles = Array.from(new Map(allCandles.map(c => [c.timestamp, c])).values());
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        const json2csvParser = new Json2CsvParser({ fields: ["timestamp", "open", "high", "low", "close", "volume"] });
        const csv = json2csvParser.parse(uniqueCandles);
        fs.writeFileSync(DATA_FILE_PATH, csv);
        log.info(`[DATA] Data successfully saved to ${DATA_FILE_PATH}`);
    } else {
        throw new Error("Failed to download any historical data. Cannot proceed with backtest.");
    }
}


// ==================================================================================
// SECTION 2: BACKTESTING LOGIC (with MA Filter Added)
// ==================================================================================

async function runBacktest() {
    log.info('--- STARTING NEW BACKTEST (WITH MA CROSSOVER FILTER) ---');
    await ensureDataFileExists();

    const dataHandler = new BacktestDataHandler(DATA_FILE_PATH);
    const executionHandler = new BacktestExecutionHandler(); // Correctly has no balance
    const strategyEngine = new StrategyEngine();
    const riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });

    // This is the source of truth for the balance, as you designed.
    let simulatedAccount = { balance: INITIAL_BALANCE }; 
    let apiCallCount = 0;

    // ... (Warm-up loop is correct and unchanged)

    // --- MAIN SIMULATION LOOP ---
    while (true) {
        const marketData = dataHandler.fetchAllData();
        if (!marketData) {
            log.info('[BACKTEST] End of historical data reached.');
            break;
        }
        
        const currentCandle = marketData.ohlc[marketData.ohlc.length - 1];
        const openTrade = executionHandler.getOpenTrade();

        // --- Trade Closing Logic (Unaltered and Correct) ---
        if (openTrade) {
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
                simulatedAccount.balance += pnl; // Correctly updates the local balance
                openTrade.status = 'closed'; openTrade.exitPrice = exitPrice; openTrade.exitTime = currentCandle.timestamp; openTrade.pnl = pnl;
                log.info(`[BACKTEST] ---- TRADE CLOSED via ${exitReason} ----`);
                log.info(`[BACKTEST] Exit: ${exitPrice} | P&L: $${pnl.toFixed(2)} | New Balance: $${simulatedAccount.balance.toFixed(2)}`);
            }
        }

        // --- Trade Opening Logic (with the one-line fix) ---
        if (!executionHandler.getOpenTrade()) {
            
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

                if (apiCallCount >= MAX_API_CALLS) {
                    log.info(`[BACKTEST] Reached the API call limit. Ending simulation.`);
                    break;
                }

                const loopStartTime = Date.now();
                apiCallCount++;
                log.info(`[BACKTEST] [Call #${apiCallCount}/${MAX_API_CALLS}] Analyzing crossover event...`);
                
                const tradingSignal = await strategyEngine.generateSignal(marketData);

                if (tradingSignal.signal !== 'HOLD' && tradingSignal.confidence >= MINIMUM_CONFIDENCE_THRESHOLD) {
                    
                    // --- THE FIX IS HERE ---
                    // We pass the marketData AND the current simulatedAccount.balance to the risk manager.
                    const tradeParams = riskManager.calculateTradeParameters({ ...marketData, balance: simulatedAccount.balance }, tradingSignal);
                    
                    if (tradeParams && tradeParams.size > 0) {
                        executionHandler.placeOrder({
                            signal: tradingSignal.signal,
                            params: tradeParams,
                            entryPrice: currentCandle.close,
                            entryTime: currentCandle.timestamp,
                            reason: tradingSignal.reason
                        });
                    }
                }

                const loopEndTime = Date.now();
                const processingTimeMs = loopEndTime - loopStartTime;
                const delayNeededMs = (MIN_SECONDS_BETWEEN_CALLS * 1000) - processingTimeMs;
                if (delayNeededMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayNeededMs));
                }
            }
        }
    }
    const finalBalance = simulatedAccount.balance;
    // --- Final Results (Unaltered) ---
    log.info('--- BACKTEST COMPLETE ---');
    const allTrades = executionHandler.getTrades();
    const totalTrades = allTrades.length;
    const winningTrades = allTrades.filter(t => t.pnl > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const finalBalance = executionHandler.balance;
    const totalPnl = finalBalance - INITIAL_BALANCE;

    console.log("\n\n--- Backtest Performance Summary ---");
    console.log(`(Based on ${apiCallCount} analyzed crossover events)`);
    console.log(`Initial Balance: $${INITIAL_BALANCE.toFixed(2)}`);
    console.log(`Final Balance:   $${finalBalance.toFixed(2)}`);
    console.log(`Total P&L:       $${totalPnl.toFixed(2)}`);
    console.log(`------------------------------------`);
    console.log(`Total Trades:    ${totalTrades}`);
    console.log(`Winning Trades:  ${winningTrades}`);
    console.log(`Losing Trades:   ${losingTrades}`);
    console.log(`Win Rate:        ${winRate.toFixed(2)}%`);
    console.log("------------------------------------\n");

    if (totalTrades > 0) {
        console.log("--- Trade Log ---");
        allTrades.forEach((trade, index) => {
            console.log(`Trade #${index + 1}: ${trade.signal} | P&L: $${trade.pnl.toFixed(2)} | Reason: ${trade.reason}`);
        });
        console.log("-----------------\n");
    }
}

// Run the combined script
runBacktest().catch(err => {
    log.error('[BACKTEST] A critical error occurred.', err);
});
