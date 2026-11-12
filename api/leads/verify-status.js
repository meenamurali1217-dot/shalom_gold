/**
 * GET /api/leads/verify-status
 * Verifies if the visitor has already registered via token or cookie.
 */
const db = require('../../lib/db');
const { validateIndianMobile } = require('../../lib/validation');
const { sendJson, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        await db.initSchema();

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const tokenQuery = url.searchParams.get('token') || req.query?.token;
        const mobileQuery = url.searchParams.get('mobile') || req.query?.mobile;

        // Extract cookie if token query param not present
        const cookieHeader = req.headers.cookie || '';
        const cookieMatch = cookieHeader.match(/shalom_lead_token=([a-f0-9]+)/);
        const token = tokenQuery || (cookieMatch ? cookieMatch[1] : null);

        if (!token && !mobileQuery) {
            return sendJson(res, 200, { registered: false });
        }

        let lead = null;

        if (token) {
            const tokenRes = await db.query(
                `SELECT lead_id FROM visitor_tokens WHERE token = $1`,
                [token]
            );
            if (tokenRes.rows.length > 0) {
                const leadRes = await db.query(
                    `SELECT id, full_name, mobile_number, lead_status, created_at FROM website_leads WHERE id = $1`,
                    [tokenRes.rows[0].lead_id]
                );
                if (leadRes.rows.length > 0) {
                    lead = leadRes.rows[0];
                }
            }
        }

        if (!lead && mobileQuery) {
            const mobileVal = validateIndianMobile(mobileQuery);
            if (mobileVal.valid) {
                const leadRes = await db.query(
                    `SELECT id, full_name, mobile_number, lead_status, created_at FROM website_leads WHERE mobile_number = $1`,
                    [mobileVal.formatted]
                );
                if (leadRes.rows.length > 0) {
                    lead = leadRes.rows[0];
                }
            }
        }

        if (lead) {
            return sendJson(res, 200, {
                registered: true,
                lead_id: lead.id,
                name: lead.full_name,
                status: lead.lead_status,
                registered_at: lead.created_at
            });
        }

        return sendJson(res, 200, { registered: false });

    } catch (err) {
        console.error('[Verify Status Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Status check failed.' });
    }
};
