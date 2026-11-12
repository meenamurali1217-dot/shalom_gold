/**
 * SHALOM GOLD - Authentication & Role-Based Authorization
 * Provides password hashing, session tokens, HTTP-only cookie management,
 * and server-side role validation.
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE_NAME = 'shalom_emp_session';
const SESSION_TTL_DAYS = 7;

/**
 * Hash a plain text password using bcrypt
 */
async function hashPassword(plainPassword) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(plainPassword, salt);
}

/**
 * Compare plain text password against hashed password
 */
async function verifyPassword(plainPassword, hashedPassword) {
    if (!hashedPassword) return false;
    return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Create a new employee session in database
 */
async function createSession(employeeId, role, ipAddress = null, userAgent = null) {
    await db.initSchema();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await db.query(`
        INSERT INTO employee_sessions (token, employee_id, role, ip_address, user_agent, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    `, [token, employeeId, role, ipAddress, userAgent, expiresAt]);

    return { token, expiresAt };
}

/**
 * Validate session token against database
 */
async function validateSession(token) {
    if (!token) return null;
    await db.initSchema();

    const res = await db.query(`
        SELECT s.token, s.role, s.expires_at, e.id as employee_id, e.name, e.email, e.phone
        FROM employee_sessions s
        JOIN employees e ON s.employee_id = e.id
        WHERE s.token = $1 AND s.expires_at > NOW()
    `, [token]);

    if (res.rows.length === 0) return null;
    return res.rows[0];
}

/**
 * Destroy session (logout)
 */
async function destroySession(token) {
    if (!token) return;
    await db.initSchema();
    await db.query(`DELETE FROM employee_sessions WHERE token = $1`, [token]);
}

/**
 * Extract session token from cookie or Authorization header
 */
function extractSessionToken(req) {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (match) return match[1];

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    return null;
}

/**
 * Generate Set-Cookie header for session
 */
function buildSessionCookieHeader(token) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const secureFlag = isProd ? '; Secure' : '';
    const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Generate Set-Cookie header to clear session
 */
function buildClearSessionCookieHeader() {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Server-side authentication and authorization middleware helper
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {string|string[]} [allowedRoles] - Role(s) allowed ('admin', 'customer_care', or array)
 * @returns {Promise<object|null>} Returns session object if authorized, or null if response was handled
 */
async function authenticateRequest(req, res, allowedRoles = null) {
    const token = extractSessionToken(req);
    const session = await validateSession(token);

    if (!session) {
        res.status(401).json({
            success: false,
            error: 'Authentication required. Please sign in to continue.'
        });
        return null;
    }

    if (allowedRoles) {
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        // Admin has superuser access across all administrative and care endpoints
        const isAuthorized = roles.includes(session.role) || session.role === 'admin';
        if (!isAuthorized) {
            res.status(403).json({
                success: false,
                error: 'Forbidden: Insufficient privileges for this operation.'
            });
            return null;
        }
    }

    return session;
}

module.exports = {
    COOKIE_NAME,
    hashPassword,
    verifyPassword,
    createSession,
    validateSession,
    destroySession,
    extractSessionToken,
    buildSessionCookieHeader,
    buildClearSessionCookieHeader,
    authenticateRequest
};
