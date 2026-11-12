/**
 * POST /api/auth/login
 * Staff & Admin Authentication Endpoint
 * Validates credentials, issues secure HTTP-only session cookie.
 */
const db = require('../../lib/db');
const { verifyPassword, createSession, buildSessionCookieHeader } = require('../../lib/auth');
const { isRateLimited } = require('../../lib/validation');
const { sendJson, parseBody, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(`login_${clientIp}`, 5, 15)) {
        return sendJson(res, 429, { success: false, error: 'Too many failed login attempts. Please wait 15 minutes before trying again.' });
    }

    try {
        await db.initSchema();
        const body = await parseBody(req);
        const { email, password } = body;

        if (!email || !password) {
            return sendJson(res, 400, { success: false, error: 'Email / Employee ID and password are required.' });
        }

        const identifier = email.trim().toLowerCase();

        // Query employee by email OR by uppercase employee ID (e.g. EMP-ADMIN, CC-101)
        const empRes = await db.query(`
            SELECT id, name, role, email, phone, password_hash
            FROM employees
            WHERE LOWER(email) = $1 OR UPPER(id) = $2
        `, [identifier, identifier.toUpperCase()]);

        if (empRes.rows.length === 0) {
            return sendJson(res, 401, { success: false, error: 'Invalid credentials. Please check your email and password.' });
        }

        const employee = empRes.rows[0];

        // Verify password
        const passwordMatches = await verifyPassword(password, employee.password_hash);
        if (!passwordMatches) {
            return sendJson(res, 401, { success: false, error: 'Invalid credentials. Please check your email and password.' });
        }

        // Update last login timestamp
        await db.query(`UPDATE employees SET last_login = NOW() WHERE id = $1`, [employee.id]);

        // Create session
        const userAgent = req.headers['user-agent'] || 'unknown';
        const session = await createSession(employee.id, employee.role, clientIp, userAgent);

        // Build HTTP-only cookie
        const cookieHeader = buildSessionCookieHeader(session.token);

        return sendJson(res, 200, {
            success: true,
            message: 'Signed in successfully.',
            employee: {
                id: employee.id,
                name: employee.name,
                role: employee.role,
                email: employee.email,
                phone: employee.phone
            }
        }, { 'Set-Cookie': cookieHeader });

    } catch (err) {
        console.error('[Login Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Login failed due to a server error.' });
    }
};
