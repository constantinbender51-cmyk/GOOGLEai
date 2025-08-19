// backtestDataHandler.js

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { log } from './logger.js';

const DATA_WINDOW_SIZE = 720; // The number of candles to provide to the strategy engine

/**
 * @class BacktestDataHandler
 * @description Reads historical data and serves a sliding window of the most recent candles.
 */
export class BacktestDataHandler {
    constructor(pathToCsv) {
        log.info(`[BACKTEST] Initializing BacktestDataHandler with file: ${pathToCsv}`);
        try {
            const fileContent = fs.readFileSync(pathToCsv, { encoding: 'utf-8' });
            this.allOhlcData = parse(fileContent, { columns: true, cast: true });
            this.currentIndex = 0;
            log.info(`[BACKTEST] Successfully loaded ${this.allOhlcData.length} historical candles.`);
        } catch (error) {
            log.error(`[BACKTEST] Failed to read or parse the CSV file at ${pathToCsv}`, error);
            throw new Error("Could not initialize backtest data.");
        }
    }

    /**
     * Simulates fetching the latest market data by returning a fixed-size sliding window of data.
     * @returns {object|null} A marketData-like object, or null if the simulation is over.
     */
    fetchAllData() {
        if (this.currentIndex >= this.allOhlcData.length) {
            return null;
        }

        // --- SLIDING WINDOW LOGIC ---
        // Calculate the start index of our window.
        // If currentIndex is less than 720, the window starts at 0.
        // Otherwise, it slides forward.
        const startIndex = Math.max(0, this.currentIndex - DATA_WINDOW_SIZE + 1);
        
        // Get the slice of data representing the current window.
        const currentWindow = this.allOhlcData.slice(startIndex, this.currentIndex + 1);

        // Move our simulation's "present moment" forward.
        this.currentIndex++;

        return {
            ohlc: currentWindow,
            balance: 0,
            openPositions: [],
            openOrders: [],
            fills: []
        };
    }

    getTotalCandles() {
        return this.allOhlcData.length;
    }
}
