/**
 * GET /api/customer-care/leads
 * Protected: Customer Care My Assigned Leads Queue.
 * Strict Role Isolation: Customer Care agents can ONLY access their own assigned leads.
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
        const session = await authenticateRequest(req, res, ['customer_care', 'admin']);
        if (!session) return;

        await db.initSchema();

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const requestedEmpId = url.searchParams.get('employee_id') || req.query?.employee_id;
        const search = (url.searchParams.get('search') || req.query?.search || '').trim();
        const status = (url.searchParams.get('status') || req.query?.status || 'All').trim();

        // Security Enforcement: Customer care agents cannot view any other agent's queue
        let targetEmployeeId = session.employee_id;
        if (session.role === 'admin' && requestedEmpId) {
            targetEmployeeId = requestedEmpId;
        }

        let queryText = `
            SELECT * FROM website_leads
            WHERE assigned_employee_id = $1
        `;
        const params = [targetEmployeeId];
        let paramIdx = 2;

        if (search) {
            queryText += ` AND (full_name ILIKE $${paramIdx} OR mobile_number ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (status && status !== 'All') {
            queryText += ` AND lead_status = $${paramIdx}`;
            params.push(status);
            paramIdx++;
        }

        queryText += ` ORDER BY id DESC`;

        const leadsRes = await db.query(queryText, params);

        // Compute agent-specific metrics
        const metricsRes = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE lead_status = 'Contacted') as contacted,
                COUNT(*) FILTER (WHERE lead_status = 'Follow-up Required') as follow_up,
                COUNT(*) FILTER (WHERE lead_status = 'Interested') as interested,
                COUNT(*) FILTER (WHERE lead_status = 'Converted') as converted
            FROM website_leads
            WHERE assigned_employee_id = $1
        `, [targetEmployeeId]);

        const m = metricsRes.rows[0];
        const metrics = {
            total: parseInt(m.total, 10) || 0,
            contacted: parseInt(m.contacted, 10) || 0,
            follow_up: parseInt(m.follow_up, 10) || 0,
            interested: parseInt(m.interested, 10) || 0,
            converted: parseInt(m.converted, 10) || 0
        };

        return sendJson(res, 200, {
            success: true,
            active_employee: {
                id: targetEmployeeId,
                name: session.role === 'admin' && requestedEmpId ? requestedEmpId : session.name
            },
            metrics,
            leads: leadsRes.rows
        });

    } catch (err) {
        console.error('[Customer Care Leads Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Failed to retrieve assigned leads.' });
    }
};
