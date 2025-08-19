// dataFetcher.js

import fs from 'fs';
import axios from 'axios';
import { Parser as Json2CsvParser } from 'json2csv';
import { log } from './logger.js';

const START_DATE = '2022-01-01T00:00:00Z'; // A deep history for backtesting
const BATCH_SIZE = 1000;

async function fetchBinanceOHLC(symbol, interval, startTime, limit) {
    const url = 'https://api.binance.com/api/v3/klines';
    const params = { symbol, interval, startTime, limit };
    try {
        const response = await axios.get(url, { params });
        return response.data.map(kline => ({
            timestamp: Math.floor(kline[0] / 1000),
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
        }));
    } catch (error) {
        log.error(`Failed to fetch Binance OHLC data for ${symbol} ${interval}. ${error.message}`);
        throw error;
    }
}

// This function is now generalized and exported
export async function downloadAndSaveData({ pair, interval, filePath }) {
    if (fs.existsSync(filePath)) {
        log.info(`[DATA] Data file already exists for ${pair} ${interval} at ${filePath}. Skipping download.`);
        return;
    }

    log.info(`[DATA] Data file not found for ${pair} ${interval}. Starting download from Binance...`);
    
    let allCandles = [];
    let startTime = new Date(START_DATE).getTime();
    const endTime = Date.now();

    while (startTime < endTime) {
        log.info(`[DATA] Fetching ${pair} ${interval} data from ${new Date(startTime).toISOString()}...`);
        try {
            const candles = await fetchBinanceOHLC(pair, interval, startTime, BATCH_SIZE);
            if (candles.length === 0) break;
            allCandles.push(...candles);
            startTime = candles[candles.length - 1].timestamp * 1000 + 1;
            await new Promise(resolve => setTimeout(resolve, 500)); // Be respectful of API limits
        } catch (error) {
            log.error(`[DATA] Stopping fetch loop for ${pair} ${interval} due to an error.`);
            break;
        }
    }

    log.info(`[DATA] Download complete for ${pair} ${interval}. Total candles fetched: ${allCandles.length}.`);

    if (allCandles.length > 0) {
        const uniqueCandles = Array.from(new Map(allCandles.map(c => [c.timestamp, c])).values());
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        const json2csvParser = new Json2CsvParser({ fields: ["timestamp", "open", "high", "low", "close", "volume"] });
        const csv = json2csvParser.parse(uniqueCandles);
        fs.writeFileSync(filePath, csv);
        log.info(`[DATA] Data successfully saved to ${filePath}`);
    } else {
        throw new Error(`Failed to download any historical data for ${pair} ${interval}.`);
    }
}
