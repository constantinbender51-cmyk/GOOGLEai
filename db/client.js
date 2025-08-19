import pg from 'pg';
import { log } from '../logger.js'; // Assuming logger is in the root

const { Pool } = pg;

let pool;

try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        // Optional: Add SSL configuration if required by Railway
        // ssl: {
        //   rejectUnauthorized: false 
        // }
    });
    log.info('Successfully created PostgreSQL connection pool.');
} catch (error) {
    log.error('Failed to create PostgreSQL connection pool.', error);
    process.exit(1); // Exit if we can't connect to the DB
}


export default {
    query: (text, params) => pool.query(text, params),
    // Add a helper to connect and release a client for transactions
    getClient: () => pool.connect(),
};
