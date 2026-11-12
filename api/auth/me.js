/**
 * GET /api/auth/me
 * Returns current authenticated employee profile or unauthenticated status.
 */
const { extractSessionToken, validateSession } = require('../../lib/auth');
const { sendJson, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    try {
        const token = extractSessionToken(req);
        if (!token) {
            return sendJson(res, 200, { authenticated: false });
        }

        const session = await validateSession(token);
        if (!session) {
            return sendJson(res, 200, { authenticated: false });
        }

        return sendJson(res, 200, {
            authenticated: true,
            employee: {
                id: session.employee_id,
                name: session.name,
                role: session.role,
                email: session.email,
                phone: session.phone
            }
        });

    } catch (err) {
        console.error('[Auth Me Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Authentication check failed.' });
    }
};
