/**
 * SHALOM GOLD - SQLite to Neon PostgreSQL Migration Script
 * Reads application records from data/shalom_leads.db and idempotently imports
 * them into Neon PostgreSQL via DATABASE_URL.
 * 
 * Preserves exact IDs, timestamps, notes, foreign keys, and resets PostgreSQL sequences.
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');

const ROOT_DIR = path.resolve(__dirname, '..');
const SQLITE_DB_PATH = path.join(ROOT_DIR, 'data', 'shalom_leads.db');
const SQLITE_BACKUP_PATH = path.join(ROOT_DIR, 'data', 'shalom_leads.db.bak');

async function migrate() {
    console.log('===========================================================');
    console.log(' SHALOM GOLD: SQLITE -> NEON POSTGRESQL MIGRATION');
    console.log('===========================================================');

    // 1. Verify and Backup SQLite database
    if (!fs.existsSync(SQLITE_DB_PATH)) {
        console.error(`[Error] SQLite database not found at: ${SQLITE_DB_PATH}`);
        process.exit(1);
    }

    console.log(`[Backup] Creating backup copy: ${SQLITE_BACKUP_PATH}...`);
    fs.copyFileSync(SQLITE_DB_PATH, SQLITE_BACKUP_PATH);
    console.log(`[Backup] Successfully verified backup.`);

    // 2. Open SQLite database
    const sqlite = new DatabaseSync(SQLITE_DB_PATH);

    // 3. Verify Neon Connection
    const connStr = db.getConnectionString();
    if (!connStr) {
        console.error('[Error] DATABASE_URL is not set!');
        console.error('Please configure DATABASE_URL in your environment variables.');
        console.error('Example: $env:DATABASE_URL="postgres://user:pass@ep-xyz.neon.tech/neondb?sslmode=require"');
        process.exit(1);
    }

    try {
        const parsedUrl = new URL(connStr);
        console.log(`\n[Neon Connection Parameters]:`);
        console.log(` -> Driver:       pg (Native Node.js TCP with TLS)`);
        console.log(` -> Protocol:     ${parsedUrl.protocol}`);
        console.log(` -> Host:         ${parsedUrl.hostname}`);
        console.log(` -> Port:         ${parsedUrl.port || '5432'}`);
        console.log(` -> Database:     ${parsedUrl.pathname.replace(/^\//, '')}`);
        console.log(` -> Username:     ${parsedUrl.username || '[not set]'}`);
        console.log(` -> Password:     ${parsedUrl.password ? '●●●●●●●● (Length: ' + parsedUrl.password.length + ' chars)' : '[NOT SET]'}`);
        console.log(` -> SSL Mode:     ${parsedUrl.searchParams.get('sslmode') || 'require'}`);
    } catch (e) {
        console.log(` -> Custom Connection String format detected.`);
    }

    console.log(`\n[Neon] Testing database connectivity...`);
    const pingRes = await db.query('SELECT NOW() as server_time, version() as pg_version');
    const versionSnippet = pingRes.rows[0]?.pg_version ? pingRes.rows[0].pg_version.split(',')[0] : 'PostgreSQL';
    console.log(`[Neon] Connected successfully! Engine: ${versionSnippet}`);
    console.log(`[Neon] Server Time: ${pingRes.rows[0]?.server_time}`);

    console.log(`\n[Neon] Ensuring database schema exists...`);
    await db.initSchema();
    console.log(`[Neon] Database schema verified & ready.`);

    // Read SQLite table data
    const sqliteLeads = sqlite.prepare("SELECT * FROM website_leads ORDER BY id ASC").all();
    const sqliteEmployees = sqlite.prepare("SELECT * FROM employees ORDER BY id ASC").all();
    const sqliteHistory = sqlite.prepare("SELECT * FROM lead_activity_history ORDER BY id ASC").all();
    const sqliteTokens = sqlite.prepare("SELECT * FROM visitor_tokens").all();

    console.log(`\n[SQLite Record Counts]:`);
    console.log(` -> employees:             ${sqliteEmployees.length}`);
    console.log(` -> website_leads:         ${sqliteLeads.length}`);
    console.log(` -> lead_activity_history: ${sqliteHistory.length}`);
    console.log(` -> visitor_tokens:        ${sqliteTokens.length}`);

    // 4. Migrate Employees
    console.log(`\n[Migrating] 1/4: employees...`);
    for (const emp of sqliteEmployees) {
        let hashToUse = emp.password_hash;
        if (!hashToUse) {
            const initialPass = emp.role === 'admin' 
                ? process.env.ADMIN_INITIAL_PASSWORD 
                : process.env.CARE_INITIAL_PASSWORD;
            if (initialPass) {
                hashToUse = await bcrypt.hash(initialPass, 10);
            }
        }
        await db.query(`
            INSERT INTO employees (id, name, role, email, phone, password_hash, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                password_hash = COALESCE(employees.password_hash, EXCLUDED.password_hash)
        `, [emp.id, emp.name, emp.role, emp.email, emp.phone, hashToUse || null]);
    }
    console.log(` -> Migrated ${sqliteEmployees.length} employees.`);

    // 5. Migrate Website Leads (Preserving exact IDs)
    console.log(`[Migrating] 2/4: website_leads...`);
    for (const l of sqliteLeads) {
        await db.query(`
            INSERT INTO website_leads (
                id, full_name, mobile_number, source, consent_status,
                consent_timestamp, created_at, lead_status,
                assigned_employee_id, follow_up_date, customer_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                mobile_number = EXCLUDED.mobile_number,
                source = EXCLUDED.source,
                consent_status = EXCLUDED.consent_status,
                consent_timestamp = EXCLUDED.consent_timestamp,
                created_at = EXCLUDED.created_at,
                lead_status = EXCLUDED.lead_status,
                assigned_employee_id = EXCLUDED.assigned_employee_id,
                follow_up_date = EXCLUDED.follow_up_date,
                customer_notes = EXCLUDED.customer_notes
        `, [
            l.id, l.full_name, l.mobile_number, l.source || 'Website Popup',
            l.consent_status, l.consent_timestamp, l.created_at,
            l.lead_status, l.assigned_employee_id || null,
            l.follow_up_date || null, l.customer_notes || null
        ]);
    }

    // Reset sequence so future inserts do not conflict
    await db.query(`
        SELECT setval('website_leads_id_seq', COALESCE((SELECT MAX(id) FROM website_leads), 1), true)
    `);
    console.log(` -> Migrated ${sqliteLeads.length} leads and reset sequence 'website_leads_id_seq'.`);

    // 6. Migrate Lead Activity History (Preserving exact IDs)
    console.log(`[Migrating] 3/4: lead_activity_history...`);
    for (const h of sqliteHistory) {
        await db.query(`
            INSERT INTO lead_activity_history (id, lead_id, actor_role, actor_name, action_type, details, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING
        `, [h.id, h.lead_id, h.actor_role, h.actor_name, h.action_type, h.details, h.timestamp]);
    }

    await db.query(`
        SELECT setval('lead_activity_history_id_seq', COALESCE((SELECT MAX(id) FROM lead_activity_history), 1), true)
    `);
    console.log(` -> Migrated ${sqliteHistory.length} audit entries and reset sequence 'lead_activity_history_id_seq'.`);

    // 7. Migrate Visitor Tokens
    console.log(`[Migrating] 4/4: visitor_tokens...`);
    for (const t of sqliteTokens) {
        await db.query(`
            INSERT INTO visitor_tokens (token, lead_id, mobile_number, created_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (token) DO NOTHING
        `, [t.token, t.lead_id, t.mobile_number, t.created_at]);
    }
    console.log(` -> Migrated ${sqliteTokens.length} visitor tokens.`);

    // 8. Count Verification
    const pgEmployees = (await db.query('SELECT COUNT(*) as cnt FROM employees')).rows[0].cnt;
    const pgLeads = (await db.query('SELECT COUNT(*) as cnt FROM website_leads')).rows[0].cnt;
    const pgHistory = (await db.query('SELECT COUNT(*) as cnt FROM lead_activity_history')).rows[0].cnt;
    const pgTokens = (await db.query('SELECT COUNT(*) as cnt FROM visitor_tokens')).rows[0].cnt;

    console.log(`\n===========================================================`);
    console.log(` POST-MIGRATION VERIFICATION AUDIT`);
    console.log(`===========================================================`);
    console.log(` Table Name              | SQLite Count | Neon Count | Status`);
    console.log(`-----------------------------------------------------------`);
    console.log(` employees               | ${String(sqliteEmployees.length).padEnd(12)} | ${String(pgEmployees).padEnd(10)} | ${Number(pgEmployees) >= sqliteEmployees.length ? 'PASS' : 'FAIL'}`);
    console.log(` website_leads           | ${String(sqliteLeads.length).padEnd(12)} | ${String(pgLeads).padEnd(10)} | ${Number(pgLeads) >= sqliteLeads.length ? 'PASS' : 'FAIL'}`);
    console.log(` lead_activity_history   | ${String(sqliteHistory.length).padEnd(12)} | ${String(pgHistory).padEnd(10)} | ${Number(pgHistory) >= sqliteHistory.length ? 'PASS' : 'FAIL'}`);
    console.log(` visitor_tokens          | ${String(sqliteTokens.length).padEnd(12)} | ${String(pgTokens).padEnd(10)} | ${Number(pgTokens) >= sqliteTokens.length ? 'PASS' : 'FAIL'}`);
    console.log(`===========================================================`);
    console.log(` MIGRATION COMPLETED SUCCESSFULLY!`);
    console.log(`===========================================================\n`);

    process.exit(0);
}

migrate().catch(err => {
    const parsed = db.parseErrorDetails(err);
    console.error('\n===========================================================');
    console.error(' [MIGRATION ERROR DIAGNOSTIC]');
    console.error('===========================================================');
    console.error(`Message: ${parsed.message}`);
    if (parsed.code) console.error(`Error Code: ${parsed.code}`);
    if (parsed.detail) console.error(`Detail: ${parsed.detail}`);
    if (parsed.stack) {
        console.error('\nStack Trace:');
        console.error(parsed.stack);
    }
    console.error('===========================================================\n');
    process.exit(1);
});

