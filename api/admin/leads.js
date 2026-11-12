/**
 * SHALOM GOLD - Combined Admin Leads API Handler
 * Consolidates:
 * 1. GET  /api/admin/leads        (action: 'leads'  or default) -> Return leads and KPI metrics
 * 2. POST /api/admin/leads/assign (action: 'assign')           -> Assign lead to care agent with audit log
 * 3. GET  /api/admin/leads/export (action: 'export')           -> Export leads to Excel-ready UTF-8 BOM CSV
 * 
 * Complies with Vercel Hobby Plan (<= 12 Serverless Functions).
 */
const db = require('../../lib/db');
const { authenticateRequest } = require('../../lib/auth');
const { sendJson, parseBody, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    // Parse URL and determine target operation
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname.replace(/\/$/, '');
    const action = (url.searchParams.get('action') || req.query?.action || '').toLowerCase();

    const isAssign = action === 'assign' || pathname.endsWith('/assign');
    const isExport = action === 'export' || pathname.endsWith('/export');

    try {
        // Enforce administrator role across all operations
        const session = await authenticateRequest(req, res, 'admin');
        if (!session) return; // 401 Unauthorized or 403 Forbidden sent by middleware

        await db.initSchema();

        // ROUTE 1: Assign Lead (POST)
        if (isAssign) {
            if (req.method !== 'POST') {
                return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
            }
            return await handleAssignLead(req, res, session);
        }

        // ROUTE 2: Export Leads to CSV (GET)
        if (isExport) {
            if (req.method !== 'GET') {
                return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
            }
            return await handleExportLeads(req, res);
        }

        // ROUTE 3: Query Leads & KPI Metrics (GET)
        if (req.method !== 'GET') {
            return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
        }
        return await handleGetLeads(req, res, url);

    } catch (err) {
        console.error('[Admin Leads API Error]:', err);
        return sendJson(res, 500, { success: false, error: 'An unexpected database error occurred.' });
    }
};

/**
 * Operation A: Query Leads & KPI Metrics
 */
async function handleGetLeads(req, res, url) {
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
}

/**
 * Operation B: Assign Lead to Customer Care Agent
 */
async function handleAssignLead(req, res, session) {
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

    // Record assignment in lead_activity_history
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
}

/**
 * Operation C: Export Leads to CSV Report
 */
async function handleExportLeads(req, res) {
    const queryText = `
        SELECT l.id, l.full_name, l.mobile_number, l.source, l.consent_status, l.consent_timestamp,
               l.created_at, l.lead_status, e.name as assigned_to, l.follow_up_date, l.customer_notes
        FROM website_leads l
        LEFT JOIN employees e ON l.assigned_employee_id = e.id
        ORDER BY l.id DESC
    `;
    const leadsRes = await db.query(queryText);
    const leads = leadsRes.rows;

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

    const csvContent = '\uFEFF' + rows.join('\r\n'); // UTF-8 BOM for Excel
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
}
