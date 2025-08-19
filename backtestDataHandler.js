// backtestDataHandler.js

import db from '../db/client.js'; // Import our database client
import { log } from '../logger.js';

export class BacktestDataHandler {
    constructor() {
        // The constructor is now async, which is a common pattern for DB-heavy classes.
        // We will need to handle this in our backtestRunner.
        this.allOhlcData = [];
    }

    /**
     * Initializes the data handler by loading all 1h data from the database.
     * This must be called before the backtest can run.
     */
    async load() {
        log.info('[DB_HANDLER] Initializing... Loading all 1h data from database.');
        try {
            const result = await db.query('SELECT * FROM candles_1h ORDER BY timestamp ASC');
            // The pg library returns numbers as strings, so we need to cast them back.
            this.allOhlcData = result.rows.map(row => ({
                timestamp: parseInt(row.timestamp, 10),
                open: parseFloat(row.open),
                high: parseFloat(row.high),
                low: parseFloat(row.low),
                close: parseFloat(row.close),
                volume: parseFloat(row.volume),
            }));
            log.info(`[DB_HANDLER] Successfully loaded ${this.allOhlcData.length} 1h candles from the database.`);
        } catch (error) {
            log.error('[DB_HANDLER] Failed to load historical data from the database.', error);
            throw new Error("Could not initialize backtest data from database.");
        }
    }

    /**
     * Returns all the loaded 1h candles.
     * This replaces the old stateful fetchAllData method.
     */
    getAllCandles() {
        return this.allOhlcData;
    }

    /**
     * Fetches a recent slice of data for a specific table (e.g., 15m candles).
     * This is for the new "Project Chimera" prompt.
     * @param {string} tableName - The name of the table (e.g., 'candles_15m').
     * @param {number} untilTimestamp - The end of the period to fetch.
     * @param {number} durationSeconds - The duration to fetch in seconds (e.g., 48 hours).
     * @returns {Promise<Array>} A promise that resolves to an array of candle data.
     */
    async fetchRecentData(tableName, untilTimestamp, durationSeconds) {
        const fromTimestamp = untilTimestamp - durationSeconds;
        const query = `
            SELECT * FROM ${tableName}
            WHERE timestamp >= $1 AND timestamp <= $2
            ORDER BY timestamp ASC;
        `;
        try {
            const result = await db.query(query, [fromTimestamp, untilTimestamp]);
            return result.rows.map(row => ({
                timestamp: parseInt(row.timestamp, 10),
                open: parseFloat(row.open),
                high: parseFloat(row.high),
                low: parseFloat(row.low),
                close: parseFloat(row.close),
                volume: parseFloat(row.volume),
            }));
        } catch (error) {
            log.error(`[DB_HANDLER] Failed to fetch recent data from ${tableName}.`, error);
            return []; // Return an empty array on failure
        }
    }
}
