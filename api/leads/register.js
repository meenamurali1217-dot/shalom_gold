/**
 * POST /api/leads/register
 * Public Customer Lead Registration Popup Handler
 * Saves leads directly to Neon PostgreSQL.
 */
const crypto = require('node:crypto');
const db = require('../../lib/db');
const { validateFullName, validateIndianMobile, isRateLimited } = require('../../lib/validation');
const { sendJson, parseBody, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited('reg_' + clientIp, 30, 5)) {
        return sendJson(res, 429, { success: false, error: 'Too many requests. Please try again after 5 minutes.' });
    }

    try {
        await db.initSchema();
        const body = await parseBody(req);
        const { full_name, mobile_number, consent_status } = body;

        // 1. Validate Name
        const nameVal = validateFullName(full_name);
        if (!nameVal.valid) {
            return sendJson(res, 400, { success: false, error: nameVal.error });
        }

        // 2. Validate Indian Mobile
        const mobileVal = validateIndianMobile(mobile_number);
        if (!mobileVal.valid) {
            return sendJson(res, 400, { success: false, error: mobileVal.error });
        }

        // 3. Validate Consent
        if (consent_status !== true && consent_status !== 1 && consent_status !== '1') {
            return sendJson(res, 400, { success: false, error: 'You must agree to the contact consent and Privacy Policy before submitting.' });
        }

        const now = new Date().toISOString();

        // 4. Check for existing lead by mobile number
        const existing = await db.query(
            `SELECT id, full_name, mobile_number, lead_status FROM website_leads WHERE mobile_number = $1`,
            [mobileVal.formatted]
        );

        let leadId;
        let isExisting = false;

        if (existing.rows.length > 0) {
            leadId = existing.rows[0].id;
            isExisting = true;

            // Log returning submission in lead_activity_history
            await db.query(`
                INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
                VALUES ($1, 'Visitor', $2, 'Re-Submission', 'Visitor re-verified details via website popup', NOW())
            `, [leadId, nameVal.name]);
        } else {
            // Insert brand new lead into website_leads
            const insertRes = await db.query(`
                INSERT INTO website_leads (
                    full_name, mobile_number, source, consent_status, consent_timestamp,
                    created_at, lead_status, assigned_employee_id, follow_up_date, customer_notes
                ) VALUES ($1, $2, 'Website Popup', 1, NOW(), NOW(), 'New', NULL, NULL, NULL)
                RETURNING id
            `, [nameVal.name, mobileVal.formatted]);

            leadId = insertRes.rows[0].id;

            // Log registration event in lead_activity_history
            await db.query(`
                INSERT INTO lead_activity_history (lead_id, actor_role, actor_name, action_type, details, timestamp)
                VALUES ($1, 'Visitor', $2, 'Registration', 'First-time registration via website popup (Consent recorded)', NOW())
            `, [leadId, nameVal.name]);
        }

        // 5. Generate secure 64-character visitor token
        const token = crypto.randomBytes(32).toString('hex');
        await db.query(`
            INSERT INTO visitor_tokens (token, lead_id, mobile_number, created_at)
            VALUES ($1, $2, $3, NOW())
        `, [token, leadId, mobileVal.formatted]);

        const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
        const secureFlag = isProd ? '; Secure' : '';
        const cookieHeader = `shalom_lead_token=${token}; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag}`;

        return sendJson(res, 201, {
            success: true,
            message: isExisting
                ? 'Welcome back! Your registration details are verified.'
                : 'Thank you! Your enquiry has been received. Our Shalom Gold advisory team will connect with you shortly.',
            lead_id: leadId,
            token: token,
            is_existing: isExisting
        }, { 'Set-Cookie': cookieHeader });

    } catch (err) {
        console.error('[Register Lead Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Registration failed due to a server error. Please try again.' });
    }
};
