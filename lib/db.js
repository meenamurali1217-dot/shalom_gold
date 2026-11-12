/**
 * SHALOM GOLD - Neon PostgreSQL Database Client
 * Uses @neondatabase/serverless with pg fallback for connection pooling in serverless environments.
 * Provides seamless local fallback when DATABASE_URL is not configured locally.
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const { Pool: PgPool } = require('pg');

// Safe error sanitizer to prevent database passwords/secrets from leaking into logs
function sanitizeErrorMessage(msg) {
    if (!msg) return '';
    return String(msg).replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1*****$2');
}

function parseErrorDetails(err) {
    if (!err) return { message: 'Unknown database error', code: '', detail: '', stack: '' };
    let msg = '';
    let stack = '';
    let code = err.code || '';
    let detail = err.detail || '';

    if (err.constructor && err.constructor.name === 'ErrorEvent') {
        const sub = err.error || err.message || err;
        msg = sub.message || String(sub);
        stack = sub.stack || '';
        code = sub.code || '';
    } else if (err instanceof Error) {
        msg = err.message;
        stack = err.stack || '';
    } else if (typeof err === 'object') {
        msg = err.message || err.error || JSON.stringify(err);
        stack = err.stack || '';
    } else {
        msg = String(err);
    }

    return {
        message: sanitizeErrorMessage(msg),
        code,
        detail: sanitizeErrorMessage(detail),
        stack: sanitizeErrorMessage(stack)
    };
}

let pool = null;
let sqliteDb = null;

function getConnectionString() {
    return process.env.DATABASE_URL || 
           process.env.POSTGRES_URL || 
           process.env.POSTGRES_PRISMA_URL ||
           process.env.POSTGRES_URL_NON_POOLING;
}

function isNeon() {
    return Boolean(getConnectionString());
}

function getPool() {
    if (!pool) {
        let connectionString = getConnectionString();
        if (!connectionString) return null;

        // Normalize sslmode=require to avoid pg-connection-string libpq warning
        if (connectionString.includes('sslmode=require')) {
            connectionString = connectionString.replace('sslmode=require', 'sslmode=no-verify');
        }

        pool = new PgPool({
            connectionString,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        pool.on('error', (err) => {
            const parsed = parseErrorDetails(err);
            console.error('[Neon Pool Error]:', parsed.message);
        });
    }
    return pool;
}

function getSqlite() {
    if (!sqliteDb) {
        const { DatabaseSync } = require('node:sqlite');
        const dbDir = path.resolve(__dirname, '..', 'data');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        const dbPath = path.join(dbDir, 'shalom_leads.db');
        sqliteDb = new DatabaseSync(dbPath);
    }
    return sqliteDb;
}

/**
 * Execute a parameterized SQL query
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<{ rows: Array, rowCount: number }>}
 */
async function query(text, params = []) {
    const p = getPool();
    if (p) {
        // Run on Neon PostgreSQL
        try {
            const res = await p.query(text, params);
            return res;
        } catch (err) {
            const parsed = parseErrorDetails(err);
            const enriched = new Error(parsed.message);
            enriched.code = parsed.code;
            enriched.detail = parsed.detail;
            enriched.stack = parsed.stack;
            throw enriched;
        }
    }

    // Local SQLite fallback mode (for offline development)
    const sqlite = getSqlite();

    // Translate PostgreSQL syntax to SQLite
    let sql = text;
    // Replace $1, $2, ... with ?
    sql = sql.replace(/\$\d+/g, '?');
    // Replace ILIKE with LIKE
    sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
    // Replace NOW() with DATETIME('now')
    sql = sql.replace(/\bNOW\(\)/gi, "DATETIME('now')");
    // Replace ::date with date()
    sql = sql.replace(/(\?|[\w\.]+)::date/gi, "date($1)");
    // Replace TIMESTAMPTZ / SERIAL
    sql = sql.replace(/\bTIMESTAMPTZ\b/gi, 'TEXT');
    sql = sql.replace(/\bSERIAL PRIMARY KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');

    try {
        const stmt = sqlite.prepare(sql);
        const trimmed = sql.trim().toUpperCase();

        if (trimmed.startsWith('SELECT') || sql.includes('RETURNING')) {
            const rows = stmt.all(...params);
            return { rows: rows || [], rowCount: rows ? rows.length : 0 };
        } else {
            const result = stmt.run(...params);
            return {
                rows: result.lastInsertRowid ? [{ id: Number(result.lastInsertRowid) }] : [],
                rowCount: Number(result.changes)
            };
        }
    } catch (err) {
        console.error('[SQLite Fallback Error]:', { query: sql, error: err.message });
        throw err;
    }
}

/**
 * Ensure database tables, indexes and constraints exist
 */
let schemaInitialized = false;
async function initSchema() {
    if (schemaInitialized) return;

    if (isNeon()) {
        await query(`
            -- 1. Employees Table
            CREATE TABLE IF NOT EXISTS employees (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                phone VARCHAR(50) NOT NULL,
                password_hash VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_login TIMESTAMPTZ DEFAULT NULL
            );

            -- 2. Website Leads Table
            CREATE TABLE IF NOT EXISTS website_leads (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                mobile_number VARCHAR(30) NOT NULL,
                source VARCHAR(100) NOT NULL DEFAULT 'Website Popup',
                consent_status INTEGER NOT NULL DEFAULT 1,
                consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                lead_status VARCHAR(50) NOT NULL DEFAULT 'New',
                assigned_employee_id VARCHAR(50) REFERENCES employees(id) ON DELETE SET NULL,
                follow_up_date VARCHAR(50) DEFAULT NULL,
                customer_notes TEXT DEFAULT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_website_leads_mobile ON website_leads(mobile_number);
            CREATE INDEX IF NOT EXISTS idx_website_leads_status ON website_leads(lead_status);
            CREATE INDEX IF NOT EXISTS idx_website_leads_employee ON website_leads(assigned_employee_id);

            -- 3. Lead Activity History Table
            CREATE TABLE IF NOT EXISTS lead_activity_history (
                id SERIAL PRIMARY KEY,
                lead_id INTEGER NOT NULL REFERENCES website_leads(id) ON DELETE CASCADE,
                actor_role VARCHAR(50) NOT NULL,
                actor_name VARCHAR(255) NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                details TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_lead_activity_lead_id ON lead_activity_history(lead_id);

            -- 4. Visitor Tokens Table
            CREATE TABLE IF NOT EXISTS visitor_tokens (
                token VARCHAR(128) PRIMARY KEY,
                lead_id INTEGER NOT NULL REFERENCES website_leads(id) ON DELETE CASCADE,
                mobile_number VARCHAR(30) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_visitor_tokens_lead_id ON visitor_tokens(lead_id);

            -- 5. Employee Sessions Table
            CREATE TABLE IF NOT EXISTS employee_sessions (
                token VARCHAR(128) PRIMARY KEY,
                employee_id VARCHAR(50) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                role VARCHAR(50) NOT NULL,
                ip_address VARCHAR(100) DEFAULT NULL,
                user_agent TEXT DEFAULT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_employee_id ON employee_sessions(employee_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON employee_sessions(expires_at);
        `);
    } else {
        // SQLite schema initialization
        const sqlite = getSqlite();
        sqlite.exec(`
            CREATE TABLE IF NOT EXISTS employees (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone TEXT NOT NULL,
                password_hash TEXT DEFAULT NULL,
                created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
                last_login TEXT DEFAULT NULL
            );

            CREATE TABLE IF NOT EXISTS website_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                mobile_number TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'Website Popup',
                consent_status INTEGER NOT NULL DEFAULT 1,
                consent_timestamp TEXT NOT NULL DEFAULT (DATETIME('now')),
                created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
                lead_status TEXT NOT NULL DEFAULT 'New',
                assigned_employee_id TEXT DEFAULT NULL,
                follow_up_date TEXT DEFAULT NULL,
                customer_notes TEXT DEFAULT NULL
            );

            CREATE TABLE IF NOT EXISTS lead_activity_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER NOT NULL,
                actor_role TEXT NOT NULL,
                actor_name TEXT NOT NULL,
                action_type TEXT NOT NULL,
                details TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT (DATETIME('now'))
            );

            CREATE TABLE IF NOT EXISTS visitor_tokens (
                token TEXT PRIMARY KEY,
                lead_id INTEGER NOT NULL,
                mobile_number TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );

            CREATE TABLE IF NOT EXISTS employee_sessions (
                token TEXT PRIMARY KEY,
                employee_id TEXT NOT NULL,
                role TEXT NOT NULL,
                ip_address TEXT DEFAULT NULL,
                user_agent TEXT DEFAULT NULL,
                created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
                expires_at TEXT NOT NULL
            );
        `);

        // Ensure columns exist on legacy tables
        try { sqlite.exec("ALTER TABLE employees ADD COLUMN password_hash TEXT DEFAULT NULL;"); } catch (e) {}
        try { sqlite.exec("ALTER TABLE employees ADD COLUMN created_at TEXT NOT NULL DEFAULT (DATETIME('now'));"); } catch (e) {}
        try { sqlite.exec("ALTER TABLE employees ADD COLUMN last_login TEXT DEFAULT NULL;"); } catch (e) {}
    }

    schemaInitialized = true;
}

module.exports = {
    getPool,
    query,
    initSchema,
    getConnectionString,
    isNeon,
    parseErrorDetails,
    sanitizeErrorMessage
};
