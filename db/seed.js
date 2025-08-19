// db/seed.js

import { log } from '../logger.js';
import db from './client.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const BATCH_SIZE = 1000;
const START_DATE = '2022-01-01T00:00:00Z';

// --- THIS FUNCTION WAS MISSING ---
async function fetchBinanceOHLC(symbol, interval, startTime, limit) {
    const url = 'https://api.binance.com/api/v3/klines';
    const params = { symbol, interval, startTime, limit };
    const response = await axios.get(url, { params });
    return response.data.map(kline => ({
        timestamp: Math.floor(kline[0] / 1000),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
    }));
}

// --- THIS FUNCTION WAS MISSING ---
async function insertCandles(client, tableName, candles) {
    const values = candles.map(c => `(${c.timestamp}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})`).join(',');
    const query = `INSERT INTO ${tableName} (timestamp, open, high, low, close, volume) VALUES ${values} ON CONFLICT (timestamp) DO NOTHING;`;
    await client.query(query);
}

// --- THIS FUNCTION WAS MISSING ---
async function seedTable({ pair, interval, tableName }) {
    log.info(`--- Seeding ${tableName} for ${pair} ${interval} ---`);
    
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        let startTime = new Date(START_DATE).getTime();
        const endTime = Date.now();
        let totalCandlesInserted = 0;

        while (startTime < endTime) {
            log.info(`[SEEDER] Fetching ${pair} ${interval} data from ${new Date(startTime).toISOString()}...`);
            const candles = await fetchBinanceOHLC(pair, interval, startTime, BATCH_SIZE);
            if (candles.length === 0) break;

            await insertCandles(client, tableName, candles);
            totalCandlesInserted += candles.length;

            startTime = candles[candles.length - 1].timestamp * 1000 + 1;
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await client.query('COMMIT');
        log.info(`--- Seeding for ${tableName} complete. Total candles processed: ${totalCandlesInserted}. ---`);
    } catch (error) {
        await client.query('ROLLBACK');
        log.error(`Error seeding ${tableName}. Transaction rolled back.`, error);
        throw error; // Re-throw the error to be caught by the main catch block
    } finally {
        client.release();
    }
}

async function createTables() {
    log.info('--- Ensuring database tables exist... ---');
    const client = await db.getClient();
    try {
        const schemaPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        await client.query(schemaSql);
        log.info('Tables created or already exist successfully.');
    } catch (error) {
        log.error('Error creating database tables:', error);
        throw error;
    } finally {
        client.release();
    }
}

// The main execution block
async function runSeeder() {
    log.info('--- Starting Database Seeding Process ---');
    
    try {
        await createTables();
        await seedTable({ pair: 'BTCUSDT', interval: '1h', tableName: 'candles_1h' });
        await seedTable({ pair: 'BTCUSDT', interval: '15m', tableName: 'candles_15m' });
        log.info('--- Database Seeding Process Finished ---');
    } catch (error) {
        log.error('The seeder process failed with a critical error:', error);
    } finally {
        log.info('Seeder script finished. Exiting.');
        process.exit(0);
    }
}

runSeeder();
