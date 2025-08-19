// fetch_data.js

import axios from 'axios';
import fs from 'fs';
import { Parser } from 'json2csv';
import { log } from './logger.js';
// We NO LONGER import from krakenApi.js to avoid any conflicts.

// --- Configuration ---
const PAIR = 'XBTUSD';
const INTERVAL = 60;
const OUTPUT_FILE = `./data/${PAIR}_${INTERVAL}m_data.csv`;
const START_DATE = '2022-01-01T00:00:00Z';

/**
 * A specialized function JUST for this script to fetch OHLC data AND the 'last' value for pagination.
 * This does NOT affect the main bot's code.
 * @param {string} pair - The trading pair.
 * @param {number} interval - The candle interval in minutes.
 * @param {number} since - The timestamp to start fetching from.
 * @returns {Promise<{candles: Array<object>, last: number|null}>} An object containing candles and the last timestamp.
 */
async function fetchPaginatedOHLC(pair, interval, since) {
    const url = `https://api.kraken.com/0/public/OHLC`;
    const params = { pair, interval, since };
    try {
        const response = await axios.get(url, { params });
        const data = response.data;

        if (data.error?.length > 0) {
            throw new Error(data.error.join(', '));
        }

        const resultKey = Object.keys(data.result).find(k => k !== 'last');
        if (!resultKey) {
            return { candles: [], last: null };
        }

        const candles = data.result[resultKey].map(item => ({
            date: new Date(item[0] * 1000).toISOString(),
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[6]),
        }));

        return { candles, last: data.result.last };

    } catch (error) {
        log.error(`Error in fetchPaginatedOHLC for since=${since}`, error);
        return { candles: [], last: null };
    }
}

/**
 * Main function to paginate through the Kraken API and save all data.
 */
async function fetchAllHistoricalData() {
    log.info(`Starting historical data download for ${PAIR}...`);

    let allCandles = [];
    let since = new Date(START_DATE).getTime() / 1000;

    while (true) {
        log.info(`Fetching data since ${new Date(since * 1000).toISOString()}...`);
        
        const { candles, last } = await fetchPaginatedOHLC(PAIR, INTERVAL, since);

        if (!candles || candles.length === 0) {
            log.info("No more data returned from API. Ending fetch.");
            break;
        }

        allCandles.push(...candles);
        log.info(`Fetched ${candles.length} candles. Total so far: ${allCandles.length}.`);

        // Use the 'last' value from the API response for the next 'since' parameter.
        since = last;

        // If the API stops providing a 'last' value, we're done.
        if (!since) {
            log.info("API did not provide a 'last' timestamp for pagination. Assuming all data is fetched.");
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    log.info(`Download complete. Total candles fetched: ${allCandles.length}.`);

    if (allCandles.length > 0) {
        const uniqueCandles = Array.from(new Map(allCandles.map(c => [c.date, c])).values());
        log.info(`Removed ${allCandles.length - uniqueCandles.length} duplicate candles.`);

        const candlesForCsv = uniqueCandles.map(c => ({
            timestamp: new Date(c.date).getTime() / 1000,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
        }));

        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(candlesForCsv);
        fs.writeFileSync(OUTPUT_FILE, csv);
        log.info(`Data successfully saved to ${OUTPUT_FILE}`);
    }
}

fetchAllHistoricalData().catch(err => {
    log.error("An error occurred during the data fetching process.", err);
});
