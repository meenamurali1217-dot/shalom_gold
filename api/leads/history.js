/**
 * GET /api/leads/history
 * Protected: Returns chronological audit trail history for a specific lead.
 */
const db = require('../../lib/db');
const { authenticateRequest } = require('../../lib/auth');
const { sendJson, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        const session = await authenticateRequest(req, res, ['customer_care', 'admin']);
        if (!session) return;

        await db.initSchema();

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const leadId = url.searchParams.get('lead_id') || req.query?.lead_id;

        if (!leadId) {
            return sendJson(res, 400, { success: false, error: 'Lead ID is required.' });
        }

        const leadRes = await db.query(
            `SELECT id, full_name, mobile_number, lead_status, created_at, customer_notes, assigned_employee_id FROM website_leads WHERE id = $1`,
            [leadId]
        );

        if (leadRes.rows.length === 0) {
            return sendJson(res, 404, { success: false, error: 'Lead not found.' });
        }

        const lead = leadRes.rows[0];

        // Security check: Customer care agents cannot inspect leads outside their assignment
        if (session.role === 'customer_care' && lead.assigned_employee_id !== session.employee_id) {
            return sendJson(res, 403, { success: false, error: 'Forbidden: You do not have permission to view this lead.' });
        }

        const historyRes = await db.query(
            `SELECT * FROM lead_activity_history WHERE lead_id = $1 ORDER BY id DESC`,
            [leadId]
        );

        return sendJson(res, 200, {
            success: true,
            lead,
            history: historyRes.rows
        });

    } catch (err) {
        console.error('[Lead History Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Failed to retrieve lead history.' });
    }
};
