// fetch_data.js

import fs from 'fs';
import { Parser } from 'json2csv';
import { log } from './logger.js';
import { KrakenFuturesApi } from './krakenApi.js';

// --- Configuration ---
const PAIR = 'XBTUSD';
const INTERVAL = 60;
const OUTPUT_FILE = `./data/${PAIR}_${INTERVAL}m_data.csv`;
const START_DATE = '2022-01-01T00:00:00Z';

async function fetchAllHistoricalData() {
    log.info(`Starting historical data download for ${PAIR}...`);

    const api = new KrakenFuturesApi('dummy_key', 'dummy_secret');
    let allCandles = [];
    let lastTimestamp = new Date(START_DATE).getTime() / 1000;

    while (true) {
        log.info(`Fetching data since ${new Date(lastTimestamp * 1000).toISOString()}`);
        
        const formattedCandles = await api.fetchKrakenData({
            pair: PAIR,
            interval: INTERVAL,
            since: lastTimestamp
        });

        // The loop should ONLY stop when the API returns no more candles.
        if (!formattedCandles || formattedCandles.length <= 1) { // <= 1 because it might just return the 'since' candle
            log.info("No new data returned. Ending fetch.");
            break;
        }

        // --- FIX: Remove the premature break condition ---
        // The old logic was stopping the loop here. By removing it, we allow
        // the pagination to continue correctly.

        // The API returns the 'since' candle again, so we slice it off to avoid duplicates.
        const newCandles = formattedCandles.slice(1);
        allCandles.push(...newCandles);

        // Update the timestamp for the next request from the last candle we just received.
        lastTimestamp = new Date(newCandles[newCandles.length - 1].date).getTime() / 1000;

        log.info(`Fetched ${newCandles.length} new candles. Total so far: ${allCandles.length}. Next fetch starts from ${new Date(lastTimestamp * 1000).toISOString()}`);

        // Be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    log.info(`Successfully downloaded a total of ${allCandles.length} candles.`);

    // --- Save the data to a CSV file ---
    if (allCandles.length > 0) {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
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
