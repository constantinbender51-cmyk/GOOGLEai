// fetch_data.js

import axios from 'axios';
import fs from 'fs';
import { Parser } from 'json2csv';
import { log } from './logger.js';

// --- Configuration ---
const PAIR = 'XBTUSD';
const INTERVAL = 60; // 1-hour candles
const OUTPUT_FILE = `./data/${PAIR}_${INTERVAL}m_data.csv`;
const START_DATE = '2022-01-01T00:00:00Z';

/**
 * Fetches a batch of OHLC data from Kraken.
 * @param {string} pair - The trading pair.
 * @param {number} interval - The candle interval in minutes.
 * @param {number} since - The timestamp to start fetching from (in seconds).
 * @returns {Promise<object|null>} The API response data or null on failure.
 */
async function fetchOHLC(pair, interval, since) {
    const url = `https://api.kraken.com/0/public/OHLC`;
    const params = { pair, interval };
    if (since) {
        params.since = since;
    }
    try {
        const response = await axios.get(url, { params });
        if (response.data.error && response.data.error.length > 0) {
            throw new Error(response.data.error.join(', '));
        }
        // Log the raw result for debugging
        if (!response.data.result || !response.data.result[pair]) {
            log.warn("API returned unexpected result structure.", response.data);
            return null;
        }
        return response.data.result;
    } catch (error) {
        log.error(`Failed to fetch OHLC data for since=${since}`, error);
        throw error;
    }
}

/**
 * Main function to paginate through the Kraken API and save all data.
 */
async function fetchAllHistoricalData() { // <-- Typo fixed here
    log.info(`Starting historical data download for ${PAIR}...`);

    let allCandles = [];
    let lastTimestamp = new Date(START_DATE).getTime() / 1000;

    while (true) {
        log.info(`Fetching data since ${new Date(lastTimestamp * 1000).toISOString()}`);
        
        const result = await fetchOHLC(PAIR, INTERVAL, lastTimestamp);

        // Check for an empty or invalid result
        if (!result || !result[PAIR] || result[PAIR].length === 0) {
            log.info("No more data returned. Ending fetch.");
            break;
        }

        const candles = result[PAIR];
        
        // Format the data into a more readable format
        const formattedCandles = candles.map(c => ({
            timestamp: parseInt(c[0]),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[6])
        }));

        allCandles.push(...formattedCandles);

        // --- RELIABLE PAGINATION LOGIC ---
        // The next 'since' should be the timestamp of the last candle we received.
        // This prevents issues with the API's 'last' value.
        const newLastTimestamp = formattedCandles[formattedCandles.length - 1].timestamp;

        // If the timestamp hasn't advanced, we're stuck in a loop.
        if (newLastTimestamp === lastTimestamp) {
            log.info("Timestamp did not advance. Assuming all data has been fetched.");
            break;
        }

        lastTimestamp = newLastTimestamp;

        // Be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    log.info(`Successfully downloaded a total of ${allCandles.length} candles.`);

    // --- Save the data to a CSV file ---
    if (allCandles.length > 0) {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(allCandles);
        fs.writeFileSync(OUTPUT_FILE, csv);
        log.info(`Data successfully saved to ${OUTPUT_FILE}`);
    }
}

// Run the script
fetchAllHistoricalData().catch(err => {
    log.error("An error occurred during the data fetching process.", err);
});
