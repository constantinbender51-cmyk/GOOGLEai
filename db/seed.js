import { log } from '../logger.js';
import db from './client.js';
import axios from 'axios';
import fs from 'fs'; // <-- IMPORT fs
import path from 'path'; // <-- IMPORT path for robust file paths

const BATCH_SIZE = 1000;
const START_DATE = '2022-01-01T00:00:00Z';

// ... (fetchBinanceOHLC and insertCandles functions are the same)

// --- NEW FUNCTION TO CREATE TABLES ---
async function createTables() {
    log.info('--- Ensuring database tables exist... ---');
    const client = await db.getClient();
    try {
        // Construct a reliable path to the schema file
        const schemaPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        
        await client.query(schemaSql);
        log.info('Tables created or already exist successfully.');
    } catch (error) {
        log.error('Error creating database tables:', error);
        throw error; // Stop the process if we can't create tables
    } finally {
        client.release();
    }
}

// ... (seedTable function is the same)

// The main execution block
async function runSeeder() {
    log.info('--- Starting Database Seeding Process ---');
    
    try {
        // --- STEP 1: CREATE TABLES ---
        await createTables();

        // --- STEP 2: SEED DATA ---
        await seedTable({ pair: 'BTCUSDT', interval: '1h', tableName: 'candles_1h' });
        await seedTable({ pair: 'BTCUSDT', interval: '15m', tableName: 'candles_15m' });
        
        log.info('--- Database Seeding Process Finished ---');
    } catch (error) {
        log.error('The seeder process failed and was stopped.', error);
    } finally {
        // We need to manually exit because the DB pool keeps the script alive
        log.info('Seeder script finished. Exiting.');
        process.exit(0);
    }
}

runSeeder();
