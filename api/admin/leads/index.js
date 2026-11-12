/**
 * GET /api/admin/leads
 * Protected: Administrator Leads Explorer with KPIs and Multi-Criteria Filtering.
 * Strictly requires admin role.
 */
const db = require('../../../lib/db');
const { authenticateRequest } = require('../../../lib/auth');
const { sendJson, handleCors } = require('../../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        const session = await authenticateRequest(req, res, 'admin');
        if (!session) return; // 401 or 403 handled

        await db.initSchema();

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const search = (url.searchParams.get('search') || req.query?.search || '').trim();
        const status = (url.searchParams.get('status') || req.query?.status || 'All').trim();
        const assignedTo = (url.searchParams.get('assigned_to') || req.query?.assigned_to || 'All').trim();
        const fromDate = url.searchParams.get('from_date') || req.query?.from_date;
        const toDate = url.searchParams.get('to_date') || req.query?.to_date;

        let queryText = `
            SELECT l.*, e.name as assigned_employee_name, e.role as assigned_employee_role
            FROM website_leads l
            LEFT JOIN employees e ON l.assigned_employee_id = e.id
            WHERE 1=1
        `;
        const params = [];
        let paramIdx = 1;

        if (search) {
            queryText += ` AND (l.full_name ILIKE $${paramIdx} OR l.mobile_number ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (status && status !== 'All') {
            queryText += ` AND l.lead_status = $${paramIdx}`;
            params.push(status);
            paramIdx++;
        }

        if (assignedTo && assignedTo !== 'All') {
            if (assignedTo === 'Unassigned') {
                queryText += ` AND (l.assigned_employee_id IS NULL OR l.assigned_employee_id = '')`;
            } else {
                queryText += ` AND l.assigned_employee_id = $${paramIdx}`;
                params.push(assignedTo);
                paramIdx++;
            }
        }

        if (fromDate) {
            queryText += ` AND l.created_at::date >= $${paramIdx}::date`;
            params.push(fromDate);
            paramIdx++;
        }

        if (toDate) {
            queryText += ` AND l.created_at::date <= $${paramIdx}::date`;
            params.push(toDate);
            paramIdx++;
        }

        queryText += ` ORDER BY l.id DESC`;

        const leadsRes = await db.query(queryText, params);

        // Compute overall metrics
        const metricsRes = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE lead_status = 'New') as new,
                COUNT(*) FILTER (WHERE lead_status = 'Assigned') as assigned,
                COUNT(*) FILTER (WHERE lead_status = 'Contacted') as contacted,
                COUNT(*) FILTER (WHERE lead_status = 'Interested') as interested,
                COUNT(*) FILTER (WHERE lead_status = 'Follow-up Required') as follow_up,
                COUNT(*) FILTER (WHERE lead_status = 'Converted') as converted,
                COUNT(*) FILTER (WHERE lead_status = 'Not Interested') as not_interested
            FROM website_leads
        `);

        const m = metricsRes.rows[0];
        const metrics = {
            total: parseInt(m.total, 10) || 0,
            new: parseInt(m.new, 10) || 0,
            assigned: parseInt(m.assigned, 10) || 0,
            contacted: parseInt(m.contacted, 10) || 0,
            interested: parseInt(m.interested, 10) || 0,
            follow_up: parseInt(m.follow_up, 10) || 0,
            converted: parseInt(m.converted, 10) || 0,
            not_interested: parseInt(m.not_interested, 10) || 0
        };

        return sendJson(res, 200, {
            success: true,
            metrics,
            leads: leadsRes.rows
        });

    } catch (err) {
        console.error('[Admin Leads Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Failed to retrieve website leads.' });
    }
};
