/**
 * POST /api/admin/leads/assign
 * Protected: Assign Lead to Customer Care Agent.
 * Requires admin role.
 */
const db = require('../../../lib/db');
const { authenticateRequest } = require('../../../lib/auth');
const { sendJson, parseBody, handleCors } = require('../../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        const session = await authenticateRequest(req, res, 'admin');
        if (!session) return;

        await db.initSchema();
        const body = await parseBody(req);
        const { lead_id, employee_id, notes } = body;

        if (!lead_id) {
            return sendJson(res, 400, { success: false, error: 'Lead ID is required.' });
        }

        const leadRes = await db.query(`SELECT * FROM website_leads WHERE id = $1`, [lead_id]);
        if (leadRes.rows.length === 0) {
            return sendJson(res, 404, { success: false, error: 'Lead not found.' });
        }

        const lead = leadRes.rows[0];

        let empName = 'Unassigned';
        if (employee_id) {
            const empRes = await db.query(`SELECT name FROM employees WHERE id = $1`, [employee_id]);
            if (empRes.rows.length > 0) {
                empName = empRes.rows[0].name;
            }
        }

        const now = new Date().toISOString();
        const newStatus = employee_id ? 'Assigned' : 'New';

        let updatedNotes = lead.customer_notes || '';
        if (notes && notes.trim()) {
            const noteEntry = `[${now.slice(0, 10)} - Assignment]: ${notes.trim()}`;
            updatedNotes = updatedNotes ? `${updatedNotes}\n${noteEntry}` : noteEntry;
        }

        await db.query(`
            UPDATE website_leads
            SET assigned_employee_id = $1, lead_status = $2, customer_notes = $3
            WHERE id = $4
        `, [employee_id || null, newStatus, updatedNotes || null, lead_id]);

        // Log audit event
        const adminName = session.name || 'Admin Executive';
        const details = `Assigned to ${empName} (${employee_id || 'None'}). Notes: ${notes || 'None'}`;
        await db.query(`
            INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
            VALUES ($1, 'Admin', $2, 'Assignment', $3, NOW())
        `, [lead_id, adminName, details]);

        return sendJson(res, 200, {
            success: true,
            message: `Lead successfully assigned to ${empName}.`
        });

    } catch (err) {
        console.error('[Assign Lead Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Failed to assign lead.' });
    }
};
