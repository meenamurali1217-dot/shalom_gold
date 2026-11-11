/**
 * SHALOM GOLD - Backend Server & Lead Management API
 * Powered by Node.js v24 (Native HTTP, Native SQLite & Crypto)
 * Port: 5000
 * Serves static files and REST API endpoints with full CORS support.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 5000;
const ROOT_DIR = __dirname;
const DB_DIR = path.join(ROOT_DIR, 'data');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'shalom_leads.db');
const db = new DatabaseSync(DB_PATH);

// Initialize Database Schema
db.exec(`
    CREATE TABLE IF NOT EXISTS website_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        mobile_number TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'Website Popup',
        consent_status INTEGER NOT NULL DEFAULT 1,
        consent_timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL,
        lead_status TEXT NOT NULL DEFAULT 'New',
        assigned_employee_id TEXT DEFAULT NULL,
        follow_up_date TEXT DEFAULT NULL,
        customer_notes TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS lead_activity_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        actor_role TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        action_type TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visitor_tokens (
        token TEXT PRIMARY KEY,
        lead_id INTEGER NOT NULL,
        mobile_number TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
`);

// Seed default employees if table is empty
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get().count;
if (employeeCount === 0) {
    const insertEmp = db.prepare('INSERT INTO employees (id, name, role, email, phone) VALUES (?, ?, ?, ?, ?)');
    insertEmp.run('EMP-ADMIN', 'Rajesh V. Zaveri (Admin)', 'admin', 'admin@shalomgold.com', '+91 88888 88888');
    insertEmp.run('CC-101', 'Priya Sharma', 'customer_care', 'priya.sharma@shalomgold.com', '+91 98765 43211');
    insertEmp.run('CC-102', 'Rahul Verma', 'customer_care', 'rahul.verma@shalomgold.com', '+91 98765 43212');
    insertEmp.run('CC-103', 'Ananya Patel', 'customer_care', 'ananya.patel@shalomgold.com', '+91 98765 43213');
    console.log('[DB] Seeded default employees (1 Admin, 3 Customer Care agents).');
}

// Helper: MIME types
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

// Rate limiting in-memory map (IP -> array of timestamps)
const rateLimitMap = new Map();
function isRateLimited(ip, maxRequests = 10, windowMinutes = 5) {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
        return true;
    }
    timestamps.push(now);
    rateLimitMap.set(ip, timestamps);
    return false;
}

// Send JSON Helper
function sendJSON(res, statusCode, data, headers = {}) {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Visitor-Token',
        ...headers
    });
    res.end(payload);
}

// Parse request body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 1e6) { // 1MB limit
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error('Invalid JSON format'));
            }
        });
        req.on('error', reject);
    });
}

// Validate Indian mobile number
function validateIndianMobile(raw) {
    if (!raw) return { valid: false, error: 'Mobile number is required' };
    const cleaned = raw.toString().replace(/[\s\-\(\)\+]/g, '');
    let digits = cleaned;
    if (digits.startsWith('91') && digits.length === 12) {
        digits = digits.substring(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
        digits = digits.substring(1);
    }
    if (!/^[6-9]\d{9}$/.test(digits)) {
        return { valid: false, error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9' };
    }
    return { valid: true, formatted: '+91' + digits, national: digits };
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Visitor-Token',
            'Access-Control-Max-Age': '86400'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    try {
        // =====================================================================
        // API ROUTES
        // =====================================================================

        // 1. POST /api/leads/register (Public Lead Registration)
        if (pathname === '/api/leads/register' && req.method === 'POST') {
            if (isRateLimited(clientIp, 10, 5)) {
                return sendJSON(res, 429, { success: false, error: 'Too many requests. Please try again after 5 minutes.' });
            }

            const body = await parseBody(req);
            const { full_name, mobile_number, consent_status } = body;

            // Validate Name
            if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
                return sendJSON(res, 400, { success: false, error: 'Please enter your full name (at least 2 characters).' });
            }
            const cleanName = full_name.trim().replace(/\s+/g, ' ');
            if (!/^[a-zA-Z\s\.\'\-]+$/.test(cleanName)) {
                return sendJSON(res, 400, { success: false, error: 'Full name should only contain letters and standard characters.' });
            }

            // Validate Indian Mobile
            const mobileValidation = validateIndianMobile(mobile_number);
            if (!mobileValidation.valid) {
                return sendJSON(res, 400, { success: false, error: mobileValidation.error });
            }

            // Validate Consent
            if (consent_status !== true && consent_status !== 1 && consent_status !== '1') {
                return sendJSON(res, 400, { success: false, error: 'You must agree to the contact consent and Privacy Policy before submitting.' });
            }

            const now = new Date().toISOString();

            // Check if mobile already exists (Idempotent / Existing Lead)
            const existingLead = db.prepare('SELECT * FROM website_leads WHERE mobile_number = ?').get(mobileValidation.formatted);

            let leadId;
            let isExisting = false;

            if (existingLead) {
                leadId = existingLead.id;
                isExisting = true;
                // Log returning submission
                db.prepare(`
                    INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
                    VALUES (?, 'Visitor', ?, 'Re-Submission', 'Visitor re-verified details via website popup', ?)
                `).run(leadId, cleanName, now);
            } else {
                // Insert New Lead
                const insertLead = db.prepare(`
                    INSERT INTO website_leads (
                        full_name, mobile_number, source, consent_status, consent_timestamp,
                        created_at, lead_status, assigned_employee_id, follow_up_date, customer_notes
                    ) VALUES (?, ?, 'Website Popup', 1, ?, ?, 'New', NULL, NULL, NULL)
                `);
                const result = insertLead.run(cleanName, mobileValidation.formatted, now, now);
                leadId = result.lastInsertRowid;

                // Log Activity
                db.prepare(`
                    INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
                    VALUES (?, 'Visitor', ?, 'Registration', 'First-time registration via website popup (Consent recorded)', ?)
                `).run(leadId, cleanName, now);
            }

            // Generate Secure Visitor Token
            const token = crypto.randomBytes(32).toString('hex');
            db.prepare(`
                INSERT INTO visitor_tokens (token, lead_id, mobile_number, created_at)
                VALUES (?, ?, ?, ?)
            `).run(token, leadId, mobileValidation.formatted, now);

            // Set cookie for automatic seamless returning visitor verification
            const cookieHeader = `shalom_lead_token=${token}; Path=/; Max-Age=31536000; SameSite=Lax`;

            return sendJSON(res, 201, {
                success: true,
                message: isExisting
                    ? 'Welcome back! Your registration details are verified.'
                    : 'Thank you! Your enquiry has been received. Our Shalom Gold advisory team will connect with you shortly.',
                lead_id: leadId,
                token: token,
                is_existing: isExisting
            }, { 'Set-Cookie': cookieHeader });
        }

        // 2. GET /api/leads/verify-status (Public Server Verification for Returning Visitors)
        if (pathname === '/api/leads/verify-status' && req.method === 'GET') {
            const token = parsedUrl.searchParams.get('token') || (req.headers.cookie && req.headers.cookie.match(/shalom_lead_token=([a-f0-9]+)/)?.[1]);
            const mobile = parsedUrl.searchParams.get('mobile');

            if (!token && !mobile) {
                return sendJSON(res, 200, { registered: false });
            }

            let lead = null;
            if (token) {
                const tokenRecord = db.prepare('SELECT lead_id FROM visitor_tokens WHERE token = ?').get(token);
                if (tokenRecord) {
                    lead = db.prepare('SELECT id, full_name, mobile_number, lead_status, created_at FROM website_leads WHERE id = ?').get(tokenRecord.lead_id);
                }
            }

            if (!lead && mobile) {
                const mobileVal = validateIndianMobile(mobile);
                if (mobileVal.valid) {
                    lead = db.prepare('SELECT id, full_name, mobile_number, lead_status, created_at FROM website_leads WHERE mobile_number = ?').get(mobileVal.formatted);
                }
            }

            if (lead) {
                return sendJSON(res, 200, {
                    registered: true,
                    lead_id: lead.id,
                    name: lead.full_name,
                    status: lead.lead_status,
                    registered_at: lead.created_at
                });
            }

            return sendJSON(res, 200, { registered: false });
        }

        // 3. GET /api/employees (List Employees for assignment dropdowns)
        if (pathname === '/api/employees' && req.method === 'GET') {
            const employees = db.prepare('SELECT id, name, role, email, phone FROM employees ORDER BY role, name').all();
            return sendJSON(res, 200, { success: true, employees });
        }

        // 4. GET /api/admin/leads (Admin - All Website Leads + Metrics)
        if (pathname === '/api/admin/leads' && req.method === 'GET') {
            const search = (parsedUrl.searchParams.get('search') || '').trim();
            const status = (parsedUrl.searchParams.get('status') || 'All').trim();
            const assignedTo = (parsedUrl.searchParams.get('assigned_to') || 'All').trim();
            const fromDate = parsedUrl.searchParams.get('from_date');
            const toDate = parsedUrl.searchParams.get('to_date');

            let query = `
                SELECT l.*, e.name as assigned_employee_name, e.role as assigned_employee_role
                FROM website_leads l
                LEFT JOIN employees e ON l.assigned_employee_id = e.id
                WHERE 1=1
            `;
            const params = [];

            if (search) {
                query += ` AND (l.full_name LIKE ? OR l.mobile_number LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            if (status && status !== 'All') {
                query += ` AND l.lead_status = ?`;
                params.push(status);
            }

            if (assignedTo && assignedTo !== 'All') {
                if (assignedTo === 'Unassigned') {
                    query += ` AND (l.assigned_employee_id IS NULL OR l.assigned_employee_id = '')`;
                } else {
                    query += ` AND l.assigned_employee_id = ?`;
                    params.push(assignedTo);
                }
            }

            if (fromDate) {
                query += ` AND date(l.created_at) >= date(?)`;
                params.push(fromDate);
            }

            if (toDate) {
                query += ` AND date(l.created_at) <= date(?)`;
                params.push(toDate);
            }

            query += ` ORDER BY l.id DESC`;

            const leads = db.prepare(query).all(...params);

            // Compute overall metric counts
            const totalLeads = db.prepare('SELECT COUNT(*) as count FROM website_leads').get().count;
            const newLeads = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE lead_status = 'New'").get().count;
            const assignedLeads = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE lead_status = 'Assigned'").get().count;
            const contactedLeads = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE lead_status = 'Contacted'").get().count;
            const interestedLeads = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE lead_status = 'Interested'").get().count;
            const followUpLeads = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE lead_status = 'Follow-up Required'").get().count;
            const convertedLeads = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE lead_status = 'Converted'").get().count;
            const notInterestedLeads = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE lead_status = 'Not Interested'").get().count;

            return sendJSON(res, 200, {
                success: true,
                metrics: {
                    total: totalLeads,
                    new: newLeads,
                    assigned: assignedLeads,
                    contacted: contactedLeads,
                    interested: interestedLeads,
                    follow_up: followUpLeads,
                    converted: convertedLeads,
                    not_interested: notInterestedLeads
                },
                leads: leads
            });
        }

        // 5. POST /api/admin/leads/assign (Admin - Assign Lead to Employee)
        if (pathname === '/api/admin/leads/assign' && req.method === 'POST') {
            const body = await parseBody(req);
            const { lead_id, employee_id, notes, actor_name } = body;

            if (!lead_id) {
                return sendJSON(res, 400, { success: false, error: 'Lead ID is required' });
            }

            const lead = db.prepare('SELECT * FROM website_leads WHERE id = ?').get(lead_id);
            if (!lead) {
                return sendJSON(res, 404, { success: false, error: 'Lead not found' });
            }

            let empName = 'Unassigned';
            if (employee_id) {
                const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employee_id);
                if (emp) empName = emp.name;
            }

            const now = new Date().toISOString();
            const newStatus = employee_id ? 'Assigned' : 'New';

            let updatedNotes = lead.customer_notes || '';
            if (notes && notes.trim()) {
                const noteEntry = `[${now.slice(0, 10)} - Assignment]: ${notes.trim()}`;
                updatedNotes = updatedNotes ? `${updatedNotes}\n${noteEntry}` : noteEntry;
            }

            db.prepare(`
                UPDATE website_leads
                SET assigned_employee_id = ?, lead_status = ?, customer_notes = ?
                WHERE id = ?
            `).run(employee_id || null, newStatus, updatedNotes || null, lead_id);

            // Log activity
            db.prepare(`
                INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
                VALUES (?, 'Admin', ?, 'Assignment', ?, ?)
            `).run(lead_id, actor_name || 'Admin Executive', `Assigned to ${empName} (${employee_id || 'None'}). Notes: ${notes || 'None'}`, now);

            return sendJSON(res, 200, {
                success: true,
                message: `Lead successfully assigned to ${empName}`
            });
        }

        // 6. GET /api/customer-care/leads (Customer Care - View Only My Assigned Leads)
        if (pathname === '/api/customer-care/leads' && req.method === 'GET') {
            const employeeId = parsedUrl.searchParams.get('employee_id');
            const search = (parsedUrl.searchParams.get('search') || '').trim();
            const status = (parsedUrl.searchParams.get('status') || 'All').trim();

            if (!employeeId) {
                return sendJSON(res, 400, { success: false, error: 'Customer Care employee ID required' });
            }

            let query = `
                SELECT * FROM website_leads
                WHERE assigned_employee_id = ?
            `;
            const params = [employeeId];

            if (search) {
                query += ` AND (full_name LIKE ? OR mobile_number LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            if (status && status !== 'All') {
                query += ` AND lead_status = ?`;
                params.push(status);
            }

            query += ` ORDER BY id DESC`;

            const leads = db.prepare(query).all(...params);

            // Compute agent-specific metrics
            const totalAssigned = db.prepare('SELECT COUNT(*) as count FROM website_leads WHERE assigned_employee_id = ?').get(employeeId).count;
            const contacted = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE assigned_employee_id = ? AND lead_status = 'Contacted'").get(employeeId).count;
            const followUpDue = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE assigned_employee_id = ? AND lead_status = 'Follow-up Required'").get(employeeId).count;
            const converted = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE assigned_employee_id = ? AND lead_status = 'Converted'").get(employeeId).count;
            const interested = db.prepare("SELECT COUNT(*) as count FROM website_leads WHERE assigned_employee_id = ? AND lead_status = 'Interested'").get(employeeId).count;

            return sendJSON(res, 200, {
                success: true,
                metrics: {
                    total: totalAssigned,
                    contacted: contacted,
                    follow_up: followUpDue,
                    interested: interested,
                    converted: converted
                },
                leads: leads
            });
        }

        // 7. POST /api/customer-care/leads/update (Customer Care / Admin - Update Status & Notes)
        if (pathname === '/api/customer-care/leads/update' && req.method === 'POST') {
            const body = await parseBody(req);
            const { lead_id, lead_status, follow_up_date, notes, actor_name, actor_role } = body;

            if (!lead_id) {
                return sendJSON(res, 400, { success: false, error: 'Lead ID is required' });
            }

            const validStatuses = ['New', 'Assigned', 'Contacted', 'Interested', 'Follow-up Required', 'Not Interested', 'Converted'];
            if (lead_status && !validStatuses.includes(lead_status)) {
                return sendJSON(res, 400, { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
            }

            const lead = db.prepare('SELECT * FROM website_leads WHERE id = ?').get(lead_id);
            if (!lead) {
                return sendJSON(res, 404, { success: false, error: 'Lead not found' });
            }

            const now = new Date().toISOString();
            const newStatus = lead_status || lead.lead_status;
            const newFollowUp = follow_up_date !== undefined ? follow_up_date : lead.follow_up_date;

            let updatedNotes = lead.customer_notes || '';
            if (notes && notes.trim()) {
                const noteEntry = `[${now.slice(0, 16).replace('T', ' ')} - ${actor_name || 'Agent'} (${newStatus})]: ${notes.trim()}`;
                updatedNotes = updatedNotes ? `${updatedNotes}\n${noteEntry}` : noteEntry;
            }

            db.prepare(`
                UPDATE website_leads
                SET lead_status = ?, follow_up_date = ?, customer_notes = ?
                WHERE id = ?
            `).run(newStatus, newFollowUp || null, updatedNotes || null, lead_id);

            // Log activity
            const logDetails = `Status: ${lead.lead_status} → ${newStatus}. Follow-up: ${newFollowUp || 'None'}. Call Notes: ${notes || 'None'}`;
            db.prepare(`
                INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
                VALUES (?, ?, ?, 'Status/Call Update', ?, ?)
            `).run(lead_id, actor_role || 'Customer Care', actor_name || 'Executive', logDetails, now);

            return sendJSON(res, 200, {
                success: true,
                message: 'Lead updated successfully',
                lead: {
                    id: lead_id,
                    lead_status: newStatus,
                    follow_up_date: newFollowUp,
                    customer_notes: updatedNotes
                }
            });
        }

        // 8. GET /api/leads/history (Lead Activity Timeline)
        if (pathname === '/api/leads/history' && req.method === 'GET') {
            const leadId = parsedUrl.searchParams.get('lead_id');
            if (!leadId) {
                return sendJSON(res, 400, { success: false, error: 'Lead ID required' });
            }

            const lead = db.prepare('SELECT id, full_name, mobile_number, lead_status, created_at, customer_notes FROM website_leads WHERE id = ?').get(leadId);
            if (!lead) {
                return sendJSON(res, 404, { success: false, error: 'Lead not found' });
            }

            const history = db.prepare('SELECT * FROM lead_activity_history WHERE lead_id = ? ORDER BY id DESC').all(leadId);

            return sendJSON(res, 200, {
                success: true,
                lead: lead,
                history: history
            });
        }

        // 9. GET /api/admin/leads/export (Admin - Export CSV Report)
        if (pathname === '/api/admin/leads/export' && req.method === 'GET') {
            const query = `
                SELECT l.id, l.full_name, l.mobile_number, l.source, l.consent_status, l.consent_timestamp,
                       l.created_at, l.lead_status, e.name as assigned_to, l.follow_up_date, l.customer_notes
                FROM website_leads l
                LEFT JOIN employees e ON l.assigned_employee_id = e.id
                ORDER BY l.id DESC
            `;
            const leads = db.prepare(query).all();

            // Build CSV
            const headers = ['Lead ID', 'Full Name', 'Mobile Number', 'Source', 'Consent Granted', 'Consent Timestamp', 'Registered At', 'Lead Status', 'Assigned Agent', 'Follow-up Date', 'Call Notes'];
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

            const csvContent = '\uFEFF' + rows.join('\r\n'); // Include BOM for Excel
            res.writeHead(200, {
                'Content-Type': 'text/csv; charset=UTF-8',
                'Content-Disposition': `attachment; filename="shalom_gold_website_leads_${new Date().toISOString().slice(0, 10)}.csv"`,
                'Access-Control-Allow-Origin': '*'
            });
            return res.end(csvContent);
        }

        // =====================================================================
        // STATIC FILE SERVING
        // =====================================================================
        let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
        if (safePath === '/' || safePath === '\\') {
            safePath = '/template.viserlab.com/hyiplab/demo/index.html';
        } else if (safePath === '/catalog' || safePath === '/catalogue' || safePath === 'catalog' || safePath === 'catalogue') {
            safePath = '/template.viserlab.com/hyiplab/demo/catalog.html';
        } else if (safePath === '/product-details' || safePath === 'product-details') {
            safePath = '/template.viserlab.com/hyiplab/demo/product-details.html';
        } else if (safePath === '/product-single' || safePath === 'product-single') {
            safePath = '/template.viserlab.com/hyiplab/demo/product-single.html';
        }

        let filePath = path.join(ROOT_DIR, safePath);

        // Check file existence
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            // Check alternate root
            const alternatePath = path.join(ROOT_DIR, 'template.viserlab.com', 'hyiplab', 'demo', safePath);
            if (fs.existsSync(alternatePath) && !fs.statSync(alternatePath).isDirectory()) {
                filePath = alternatePath;
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
                return res.end('404 Not Found: ' + pathname);
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

    } catch (err) {
        console.error('[Server Error]:', err);
        sendJSON(res, 500, { success: false, error: 'Internal server error: ' + err.message });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` SHALOM GOLD Backend Server & Leads API Active`);
    console.log(` Listening on: http://127.0.0.1:${PORT}`);
    console.log(` Database:     ${DB_PATH}`);
    console.log(`=======================================================`);
});
