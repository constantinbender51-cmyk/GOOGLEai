// backtest.js

import fs from 'fs';
import axios from 'axios';
import { Parser as Json2CsvParser } from 'json2csv';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';
import { log } from './logger.js';
import { EMA } from 'technicalindicators'; // Import the EMA calculator

// --- Configuration ---
const DATA_FILE_PATH = './data/XBTUSD_60m_data.csv';
const INITIAL_BALANCE = 10000;
const MINIMUM_CONFIDENCE_THRESHOLD = 40;
const MIN_SECONDS_BETWEEN_CALLS = 60; // Keep this for the token rate limit
const MAX_API_CALLS = 500; // We can increase this now that we're making fewer calls
const DATA_WINDOW_SIZE = 720;
const WARMUP_PERIOD = DATA_WINDOW_SIZE;

// ... (Data fetching logic remains the same) ...

// ==================================================================================
// SECTION 2: BACKTESTING LOGIC (with MA Crossover Filter)
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

    executionHandler.printSummary();
}

runBacktest().catch(err => {
    log.error('[BACKTEST] A critical error occurred.', err);
});
