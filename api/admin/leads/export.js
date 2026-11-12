/**
 * GET /api/admin/leads/export
 * Protected: Export all website leads to CSV report with UTF-8 BOM for Excel.
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
        if (!session) return;

        await db.initSchema();

        const queryText = `
            SELECT l.id, l.full_name, l.mobile_number, l.source, l.consent_status, l.consent_timestamp,
                   l.created_at, l.lead_status, e.name as assigned_to, l.follow_up_date, l.customer_notes
            FROM website_leads l
            LEFT JOIN employees e ON l.assigned_employee_id = e.id
            ORDER BY l.id DESC
        `;
        const leadsRes = await db.query(queryText);
        const leads = leadsRes.rows;

        // Build CSV
        const headers = [
            'Lead ID', 'Full Name', 'Mobile Number', 'Source', 'Consent Granted',
            'Consent Timestamp', 'Registered At', 'Lead Status', 'Assigned Agent',
            'Follow-up Date', 'Call Notes'
        ];
        const rows = [headers.join(',')];

        leads.forEach(l => {
            const escapeCSV = val => {
                if (val === null || val === undefined) return '""';
                return `"${String(val).replace(/"/g, '""').replace(/(\r\n|\n|\r)/g, ' ')}"`;
            };
            rows.push([
                l.id,
                escapeCSV(l.full_name),
                escapeCSV(l.mobile_number),
                escapeCSV(l.source),
                l.consent_status ? 'YES' : 'NO',
                escapeCSV(l.consent_timestamp),
                escapeCSV(l.created_at),
                escapeCSV(l.lead_status),
                escapeCSV(l.assigned_to || 'Unassigned'),
                escapeCSV(l.follow_up_date || 'N/A'),
                escapeCSV(l.customer_notes || 'None')
            ].join(','));
        });

        const csvContent = '\uFEFF' + rows.join('\r\n'); // UTF-8 BOM
        const filename = `shalom_gold_website_leads_${new Date().toISOString().slice(0, 10)}.csv`;

        if (typeof res.setHeader === 'function') {
            res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.status(200).send(csvContent);
        }

        res.writeHead(200, {
            'Content-Type': 'text/csv; charset=UTF-8',
            'Content-Disposition': `attachment; filename="${filename}"`
        });
        return res.end(csvContent);

    } catch (err) {
        console.error('[Export Leads Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Failed to export leads report.' });
    }
};
