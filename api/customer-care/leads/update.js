/**
 * POST /api/customer-care/leads/update
 * Protected: Update lead status, schedule follow-up date, and log call notes.
 * Enforces ownership: Customer Care agents can only update leads assigned to them.
 */
const db = require('../../../lib/db');
const { authenticateRequest } = require('../../../lib/auth');
const { sendJson, parseBody, handleCors } = require('../../../lib/response');

const VALID_STATUSES = ['New', 'Assigned', 'Contacted', 'Interested', 'Follow-up Required', 'Not Interested', 'Converted'];

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    try {
        const session = await authenticateRequest(req, res, ['customer_care', 'admin']);
        if (!session) return;

        await db.initSchema();
        const body = await parseBody(req);
        const { lead_id, lead_status, follow_up_date, notes } = body;

        if (!lead_id) {
            return sendJson(res, 400, { success: false, error: 'Lead ID is required.' });
        }

        if (lead_status && !VALID_STATUSES.includes(lead_status)) {
            return sendJson(res, 400, { success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
        }

        const leadRes = await db.query(`SELECT * FROM website_leads WHERE id = $1`, [lead_id]);
        if (leadRes.rows.length === 0) {
            return sendJson(res, 404, { success: false, error: 'Lead not found.' });
        }

        const lead = leadRes.rows[0];

        // Security Enforcement: Customer care agents cannot modify leads belonging to another agent
        if (session.role === 'customer_care' && lead.assigned_employee_id !== session.employee_id) {
            return sendJson(res, 403, {
                success: false,
                error: 'Forbidden: You are only authorized to update leads assigned directly to your queue.'
            });
        }

        const now = new Date().toISOString();
        const newStatus = lead_status || lead.lead_status;
        const newFollowUp = follow_up_date !== undefined ? follow_up_date : lead.follow_up_date;

        let updatedNotes = lead.customer_notes || '';
        if (notes && notes.trim()) {
            const agentName = session.name || 'Agent';
            const noteEntry = `[${now.slice(0, 16).replace('T', ' ')} - ${agentName} (${newStatus})]: ${notes.trim()}`;
            updatedNotes = updatedNotes ? `${updatedNotes}\n${noteEntry}` : noteEntry;
        }

        await db.query(`
            UPDATE website_leads
            SET lead_status = $1, follow_up_date = $2, customer_notes = $3
            WHERE id = $4
        `, [newStatus, newFollowUp || null, updatedNotes || null, lead_id]);

        // Log activity history
        const logDetails = `Status: ${lead.lead_status} → ${newStatus}. Follow-up: ${newFollowUp || 'None'}. Call Notes: ${notes || 'None'}`;
        await db.query(`
            INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
            VALUES ($1, $2, $3, 'Status/Call Update', $4, NOW())
        `, [lead_id, session.role === 'admin' ? 'Admin' : 'Customer Care', session.name || 'Executive', logDetails]);

        return sendJson(res, 200, {
            success: true,
            message: 'Lead updated successfully.',
            lead: {
                id: lead_id,
                lead_status: newStatus,
                follow_up_date: newFollowUp,
                customer_notes: updatedNotes
            }
        });

    } catch (err) {
        console.error('[Update Lead Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Failed to update lead.' });
    }
};
