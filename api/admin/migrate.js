/**
 * POST /api/admin/migrate
 * One-Click Cloud Migration Runner
 * Migrates existing SQLite application records to Neon PostgreSQL in production.
 * Protected by secret key or active admin session.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const db = require('../../lib/db');
const { extractSessionToken, validateSession } = require('../../lib/auth');
const { sendJson, parseBody, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        const body = await parseBody(req);
        const secret = body.secret || req.headers['x-setup-secret'];
        const configuredSecret = process.env.SETUP_SECRET || process.env.ADMIN_SECRET || process.env.MIGRATION_SECRET;

        // Allow either configured secret OR active admin session
        let isAuthorized = false;
        if (configuredSecret && secret && secret === configuredSecret) {
            isAuthorized = true;
        } else {
            const token = extractSessionToken(req);
            const session = await validateSession(token);
            if (session && session.role === 'admin') {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return sendJson(res, 403, {
                success: false,
                error: 'Forbidden: Valid migration secret or administrator session required.'
            });
        }

        const ROOT_DIR = process.cwd();
        const SQLITE_DB_PATH = path.join(ROOT_DIR, 'data', 'shalom_leads.db');

        if (!fs.existsSync(SQLITE_DB_PATH)) {
            return sendJson(res, 404, { success: false, error: 'SQLite database file not found in deployment.' });
        }

        await db.initSchema();
        const sqlite = new DatabaseSync(SQLITE_DB_PATH);

        const sqliteLeads = sqlite.prepare("SELECT * FROM website_leads ORDER BY id ASC").all();
        const sqliteEmployees = sqlite.prepare("SELECT * FROM employees ORDER BY id ASC").all();
        const sqliteHistory = sqlite.prepare("SELECT * FROM lead_activity_history ORDER BY id ASC").all();
        const sqliteTokens = sqlite.prepare("SELECT * FROM visitor_tokens").all();

        // 1. Employees
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
            `, [emp.id, emp.name, emp.role, emp.email, emp.phone, hashToUse]);
        }

        // 2. Website Leads
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

        // Reset Sequence
        await db.query(`
            SELECT setval('website_leads_id_seq', COALESCE((SELECT MAX(id) FROM website_leads), 1), true)
        `);

        // 3. Activity History
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

        // 4. Tokens
        for (const t of sqliteTokens) {
            await db.query(`
                INSERT INTO visitor_tokens (token, lead_id, mobile_number, created_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (token) DO NOTHING
            `, [t.token, t.lead_id, t.mobile_number, t.created_at]);
        }

        // 5. Verification
        const pgEmployees = (await db.query('SELECT COUNT(*) as cnt FROM employees')).rows[0].cnt;
        const pgLeads = (await db.query('SELECT COUNT(*) as cnt FROM website_leads')).rows[0].cnt;
        const pgHistory = (await db.query('SELECT COUNT(*) as cnt FROM lead_activity_history')).rows[0].cnt;
        const pgTokens = (await db.query('SELECT COUNT(*) as cnt FROM visitor_tokens')).rows[0].cnt;

        return sendJson(res, 200, {
            success: true,
            message: 'Migration completed successfully and verified.',
            audit: {
                employees: { sqlite: sqliteEmployees.length, neon: parseInt(pgEmployees, 10) },
                website_leads: { sqlite: sqliteLeads.length, neon: parseInt(pgLeads, 10) },
                lead_activity_history: { sqlite: sqliteHistory.length, neon: parseInt(pgHistory, 10) },
                visitor_tokens: { sqlite: sqliteTokens.length, neon: parseInt(pgTokens, 10) }
            }
        });

    } catch (err) {
        console.error('[Migration Runner Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Migration failed: ' + err.message });
    }
};
