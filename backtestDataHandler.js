import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { log } from './logger.js';

/**
 * @class BacktestDataHandler
 * @description Reads historical OHLC data from a CSV file and serves it one candle at a time for simulation.
 */
export class BacktestDataHandler {
    /**
     * @param {string} pathToCsv - The file path to the historical data CSV.
     */
    constructor(pathToCsv) {
        log.info(`[BACKTEST] Initializing BacktestDataHandler with file: ${pathToCsv}`);
        try {
            const fileContent = fs.readFileSync(pathToCsv, { encoding: 'utf-8' });
            // The 'columns: true' option automatically uses the header row for keys.
            // The 'cast: true' option automatically converts strings to numbers/booleans where appropriate.
            this.allOhlcData = parse(fileContent, { columns: true, cast: true });
            this.currentIndex = 0; // This pointer represents the "present moment" in our simulation.
            log.info(`[BACKTEST] Successfully loaded ${this.allOhlcData.length} historical candles.`);
        } catch (error) {
            log.error(`[BACKTEST] Failed to read or parse the CSV file at ${pathToCsv}`, error);
            throw new Error("Could not initialize backtest data.");
        }
    }

    /**
     * Simulates fetching the latest market data by returning all data up to the current point in the simulation.
     * @returns {object|null} A marketData-like object for the strategy, or null if the simulation is over.
     */
    fetchAllData() {
        // Check if we have run out of historical data.
        if (this.currentIndex >= this.allOhlcData.length) {
            return null; // Signal that the backtest is complete.
        }

        // Get all data from the beginning up to the current index.
        // The StrategyEngine needs a history of candles to calculate indicators.
        const currentDataSlice = this.allOhlcData.slice(0, this.currentIndex + 1);

        // Move our simulation's "present moment" forward by one candle.
        this.currentIndex++;

        // Return a fake marketData object that mimics the live DataHandler's output.
        return {
            ohlc: currentDataSlice,
            // These values are placeholders. The backtest loop will manage the simulated balance and positions.
            balance: 0, 
            openPositions: [],
            openOrders: [],
            fills: []
        };
    }

    /**
     * A helper to get the total number of data points.
     * @returns {number}
     */
    getTotalCandles() {
        return this.allOhlcData.length;
    }
}
