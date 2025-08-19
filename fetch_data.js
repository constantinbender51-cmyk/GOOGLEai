// fetch_data.js

import axios from 'axios';
import fs from 'fs';
import { Parser } from 'json2csv';
import { log } from './logger.js';

// --- Configuration ---
const PAIR = 'XBTUSD';
const INTERVAL = 60;
const OUTPUT_FILE = `./data/${PAIR}_${INTERVAL}m_data.csv`;
const START_DATE = '2022-01-01T00:00:00Z';

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
        log.error(`Error in fetchPaginatedOHLC for since=${since} | ${error.message}`);
        // Re-throw the error so the main loop can catch it and stop
        throw error;
    }
}

async function fetchAllHistoricalData() {
    log.info(`Starting historical data download for ${PAIR}...`);

    let allCandles = [];
    let since = new Date(START_DATE).getTime() / 1000;
    let previousSince = null; // Variable to track the last 'since' value

    while (true) {
        // --- THE FIX: Check for a stagnant 'since' value ---
        if (since === previousSince) {
            log.info("The 'since' timestamp is not advancing. All data has been fetched.");
            break;
        }

        try {
            log.info(`Fetching data since ${new Date(since * 1000).toISOString()}...`);
            
            const { candles, last } = await fetchPaginatedOHLC(PAIR, INTERVAL, since);

            if (!candles || candles.length === 0) {
                log.info("No more data returned from API. Ending fetch.");
                break;
            }

            allCandles.push(...candles);
            log.info(`Fetched ${candles.length} candles. Total so far: ${allCandles.length}.`);

            previousSince = since; // Store the 'since' we just used
            since = last; // Update 'since' for the next loop

            if (!since) {
                log.info("API did not provide a 'last' timestamp. Assuming all data is fetched.");
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay to be safer

        } catch (error) {
            log.error("Stopping fetch loop due to an error in fetchPaginatedOHLC.");
            break; // Exit the loop on error
        }
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
    // The error is already logged inside the loop, so we just note the process ended.
    log.info("Data fetching process finished.");
});
