/**
 * GET /api/employees
 * Protected: Returns list of employees for assignment dropdowns.
 * Never exposes password hashes.
 */
const db = require('../lib/db');
const { authenticateRequest } = require('../lib/auth');
const { sendJson, handleCors } = require('../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        const session = await authenticateRequest(req, res);
        if (!session) return; // Response handled by middleware

        await db.initSchema();
        const empRes = await db.query(`
            SELECT id, name, role, email, phone, created_at, last_login
            FROM employees
            ORDER BY role, name
        `);

        return sendJson(res, 200, {
            success: true,
            employees: empRes.rows
        });

    } catch (err) {
        console.error('[Get Employees Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Failed to fetch employees.' });
    }
};
