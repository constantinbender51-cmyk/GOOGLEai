import axios from 'axios';
import fs from 'fs';
import { Parser } from 'json2csv';
import { log } from './logger.js'; // We can reuse our logger!

// --- Configuration ---
const PAIR = 'XBTUSD';
const INTERVAL = 60; // 1-hour candles
const OUTPUT_FILE = `./data/${PAIR}_${INTERVAL}m_data.csv`;
const START_DATE = '2022-01-01T00:00:00Z'; // Let's get data starting from Jan 1, 2022

/**
 * Fetches a batch of OHLC data from Kraken.
 * @param {string} pair - The trading pair.
 * @param {number} interval - The candle interval in minutes.
 * @param {number} since - The timestamp to start fetching from (in seconds).
 * @returns {Promise<object>} The API response data.
 */
async function fetchOHLC(pair, interval, since) {
    const url = `https://api.kraken.com/0/public/OHLC`;
    const params = { pair, interval, since };
    try {
        const response = await axios.get(url, { params });
        if (response.data.error && response.data.error.length > 0) {
            throw new Error(response.data.error.join(', '));
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
async function fetchAllHistoricalData() {
    log.info(`Starting historical data download for ${PAIR}...`);

    let allCandles = [];
    let lastTimestamp = new Date(START_DATE).getTime() / 1000;

    while (true) {
        log.info(`Fetching data since ${new Date(lastTimestamp * 1000).toISOString()}`);
        const result = await fetchOHLC(PAIR, INTERVAL, lastTimestamp);
        const candles = result[PAIR];

        if (!candles || candles.length === 0) {
            log.info("No more data returned. Ending fetch.");
            break;
        }

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

        // The 'last' value in the response is the timestamp of the next candle to ask for
        const nextTimestamp = parseInt(result.last) / 1e9; // It's in nanoseconds, convert to seconds

        // Check if we've received all data up to the present
        if (nextTimestamp === lastTimestamp || candles.length < 720) {
            log.info("Fetched all available data up to the last batch.");
            break;
        }

        lastTimestamp = nextTimestamp;

        // Be respectful to the API and wait a moment between requests
        await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5-second delay
    }

    log.info(`Successfully downloaded a total of ${allCandles.length} candles.`);

    // --- Save the data to a CSV file ---
    if (allCandles.length > 0) {
        // Ensure the 'data' directory exists
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
