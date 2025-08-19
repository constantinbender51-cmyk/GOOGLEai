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
const MINIMUM_CONFIDENCE_THRESHOLD = 70;
const MIN_SECONDS_BETWEEN_CALLS = 100;
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
    log.info('--- STARTING NEW BACKTEST ---');
    await ensureDataFileExists(); // This function is defined further down

    const dataHandler = new BacktestDataHandler(DATA_FILE_PATH);
    const executionHandler = new BacktestExecutionHandler();
    const strategyEngine = new StrategyEngine();
    const riskManager = new RiskManager({ leverage: 10, marginBuffer: 0.01 });

    let simulatedAccount = { balance: INITIAL_BALANCE };
    let apiCallCount = 0;

    // --- WARM-UP LOOP ---
    log.info(`[BACKTEST] Warming up indicators with ${WARMUP_PERIOD} candles...`);
    for (let i = 0; i < WARMUP_PERIOD; i++) {
        const hasData = dataHandler.fetchAllData();
        if (!hasData) {
            throw new Error("Not enough data for the warm-up period. Get a larger dataset.");
        }
    }
    log.info('[BACKTEST] Warm-up complete. Starting simulation.');


    // --- MAIN SIMULATION LOOP ---
    while (true) {
        const loopStartTime = Date.now();
        const marketData = dataHandler.fetchAllData();
        if (!marketData) {
            log.info('[BACKTEST] End of historical data reached.');
            break;
        }
        // ... (The rest of the backtesting loop remains exactly the same)
        const currentCandle = marketData.ohlc[marketData.ohlc.length - 1];
        const openTrade = executionHandler.getOpenTrade();
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
                simulatedAccount.balance += pnl;
                openTrade.status = 'closed'; openTrade.exitPrice = exitPrice; openTrade.exitTime = currentCandle.timestamp; openTrade.pnl = pnl;
                log.info(`[BACKTEST] ---- TRADE CLOSED via ${exitReason} ----`);
                log.info(`[BACKTEST] Exit: ${exitPrice} | P&L: $${pnl.toFixed(2)} | New Balance: $${simulatedAccount.balance.toFixed(2)}`);
            }
        }
        if (!executionHandler.getOpenTrade()) {
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

// Run the combined script
runBacktest().catch(err => {
    log.error('[BACKTEST] A critical error occurred.', err);
});
