// backtest.js

import fs from 'fs';
import axios from 'axios';
import { Parser as Json2CsvParser } from 'json2csv';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';
import { log } from './logger.js';

// --- Configuration ---
const DATA_FILE_PATH = './data/XBTUSD_60m_data.csv';
const INITIAL_BALANCE = 10000;
const MINIMUM_CONFIDENCE_THRESHOLD = 40;
const MIN_SECONDS_BETWEEN_CALLS = 60;
const MAX_API_CALLS = 10;
// ... (imports)

// --- Backtest Configuration ---
// ...
const DATA_WINDOW_SIZE = 720; // Define it here as well for clarity
const WARMUP_PERIOD = DATA_WINDOW_SIZE; // Warm up with a full window of data

// ... (the rest of the file is the same)

// ==================================================================================
// SECTION 1: DATA FETCHING LOGIC (copied from fetch_data.js)
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
// SECTION 2: BACKTESTING LOGIC (the original backtest.js)
// ==================================================================================

async function runBacktest() {
    log.info('--- STARTING NEW BACKTEST (WITH MA CROSSOVER FILTER) ---');
    await ensureDataFileExists();

    const dataHandler = new BacktestDataHandler(DATA_FILE_PATH);
    await dataHandler.loadData(); // Make sure data is loaded
    const allCandles = dataHandler.getAllCandles();

    const executionHandler = new BacktestExecutionHandler(INITIAL_BALANCE);
    const strategyEngine = new StrategyEngine();
    const riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });

    let apiCallCount = 0;
    let openPosition = null;

    for (let i = WARMUP_PERIOD; i < allCandles.length; i++) {
        const currentCandle = allCandles[i];
        const marketData = {
            ohlc: allCandles.slice(i - DATA_WINDOW_SIZE, i),
            balance: executionHandler.balance
        };

        // --- Trade Closing Logic (runs on every candle) ---
        openPosition = executionHandler.getOpenTrade();
        if (openPosition) {
            // ... (The existing trade closing logic is perfect)
            let exitPrice = null;
            if (openPosition.signal === 'LONG' && currentCandle.low <= openPosition.stopLoss) exitPrice = openPosition.stopLoss;
            if (openPosition.signal === 'LONG' && currentCandle.high >= openPosition.takeProfit) exitPrice = openPosition.takeProfit;
            if (openPosition.signal === 'SHORT' && currentCandle.high >= openPosition.stopLoss) exitPrice = openPosition.stopLoss;
            if (openPosition.signal === 'SHORT' && currentCandle.low <= openPosition.takeProfit) exitPrice = openPosition.takeProfit;
            
            if(exitPrice) {
                executionHandler.closeTrade(openPosition, exitPrice, currentCandle.timestamp);
                openPosition = null;
                continue; // Position closed, move to the next candle
            }
        }

        // --- Trade Opening Logic (only runs if no trade is open) ---
        if (!openPosition) {
            // --- MOVING AVERAGE CROSSOVER PRE-FILTER ---
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
                log.info(`[FILTER] Potential signal found at candle ${i}: ${isBullishCrossover ? 'Bullish' : 'Bearish'} Crossover.`);
                
                if (apiCallCount >= MAX_API_CALLS) {
                    log.info(`[BACKTEST] Reached the API call limit of ${MAX_API_CALLS}. Ending simulation.`);
                    break;
                }

                // Wait for the required time *only* when we are about to call the AI
                await new Promise(resolve => setTimeout(resolve, MIN_SECONDS_BETWEEN_CALLS * 1000));
                
                apiCallCount++;
                log.info(`[BACKTEST] [Call #${apiCallCount}/${MAX_API_CALLS}] Analyzing crossover event...`);
                
                const tradingSignal = await strategyEngine.generateSignal(marketData);

                if (tradingSignal.signal !== 'HOLD' && tradingSignal.confidence >= MINIMUM_CONFIDENCE_THRESHOLD) {
                    const tradeParams = riskManager.calculateTradeParameters(marketData, tradingSignal);
                    if (tradeParams && tradeParams.size > 0) {
                        executionHandler.placeOrder({
                            signal: tradingSignal.signal,
                            params: tradeParams,
                            entryPrice: currentCandle.close,
                            entryTime: currentCandle.timestamp,
                            reason: tradingSignal.reason // Pass the reason for logging
                        });
                    }
                }
            }
            // If no crossover, we do nothing and the loop continues to the next candle instantly.
        }
    }

    // --- Final Results ---
    log.info('--- SPEED RUN COMPLETE ---');
    const totalTrades = executionHandler.trades.length;
    const winningTrades = executionHandler.trades.filter(t => t.pnl > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const finalBalance = simulatedAccount.balance;
    const totalPnl = finalBalance - INITIAL_BALANCE;

    console.log("\n\n--- Speed Run Performance Summary ---");
    console.log(`(Based on ${apiCallCount} analyzed candles)`);
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
// Run the combined script
runBacktest().catch(err => {
    log.error('[BACKTEST] A critical error occurred.', err);
});
