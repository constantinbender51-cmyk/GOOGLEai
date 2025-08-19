import fs from 'fs';
import axios from 'axios';
import { Parser as Json2CsvParser } from 'json2csv';
import { log } from './logger.js';

const BINANCE_PAIR = 'BTCUSDT';
const INTERVAL = '1h';
const START_DATE = '2022-01-01T00:00:00Z';
const BATCH_SIZE = 1000;

async function fetchBinanceOHLC(symbol, interval, startTime, limit) {
    // ... (function is the same)
}

export async function ensureDataFileExists(filePath) {
    if (fs.existsSync(filePath)) {
        log.info(`[DATA] Data file already exists at ${filePath}. Skipping download.`);
        return;
    }
    // ... (the rest of the data fetching logic is the same)
}
