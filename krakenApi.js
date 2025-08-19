// fetch_data.js

import fs from 'fs';
import { Parser } from 'json2csv';
import { log } from './logger.js';
import { KrakenFuturesApi } from './krakenApi.js'; // Import our existing API class

// --- Configuration ---
const PAIR = 'XBTUSD'; // The fetchKrakenData function handles the correct API pair name internally
const INTERVAL = 60; // 1-hour candles
const OUTPUT_FILE = `./data/${PAIR}_${INTERVAL}m_data.csv`;
const START_DATE = '2022-01-01T00:00:00Z';

/**
 * Main function to paginate through the Kraken API and save all data.
 */
async function fetchAllHistoricalData() {
    log.info(`Starting historical data download for ${PAIR}...`);

    // We don't need real keys for the public data endpoint, but we need to instantiate the class
    // to access the method. We can pass dummy values.
    const api = new KrakenFuturesApi('dummy_key', 'dummy_secret');

    let allCandles = [];
    let lastTimestamp = new Date(START_DATE).getTime() / 1000;

    while (true) {
        log.info(`Fetching data since ${new Date(lastTimestamp * 1000).toISOString()}`);
        
        // --- USE THE PROVEN, WORKING FUNCTION ---
        const formattedCandles = await api.fetchKrakenData({
            pair: PAIR,
            interval: INTERVAL,
            since: lastTimestamp
        });

        if (!formattedCandles || formattedCandles.length === 0) {
            log.info("No more data returned. Ending fetch.");
            break;
        }

        // The data is already formatted, so we just add it to our array
        allCandles.push(...formattedCandles);

        // Get the timestamp of the last candle we received to use for the next 'since' parameter
        // We need to convert the ISO date string back to a Unix timestamp in seconds
        const newLastTimestamp = new Date(formattedCandles[formattedCandles.length - 1].date).getTime() / 1000;

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
        // The field 'date' needs to be renamed to 'timestamp' for consistency with our backtester plan
        const candlesForCsv = allCandles.map(c => ({
            timestamp: new Date(c.date).getTime() / 1000,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(candlesForCsv);
        fs.writeFileSync(OUTPUT_FILE, csv);
        log.info(`Data successfully saved to ${OUTPUT_FILE}`);
    }
}

// Run the script
fetchAllHistoricalData().catch(err => {
    log.error("An error occurred during the data fetching process.", err);
});
