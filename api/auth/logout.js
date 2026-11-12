/**
 * POST /api/auth/logout
 * Destroys server-side session and clears authentication cookie.
 */
const { extractSessionToken, destroySession, buildClearSessionCookieHeader } = require('../../lib/auth');
const { sendJson, handleCors } = require('../../lib/response');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    try {
        const token = extractSessionToken(req);
        if (token) {
            await destroySession(token);
        }

        const clearCookie = buildClearSessionCookieHeader();
        return sendJson(res, 200, {
            success: true,
            message: 'Signed out successfully.'
        }, { 'Set-Cookie': clearCookie });

    } catch (err) {
        console.error('[Logout Error]:', err);
        return sendJson(res, 500, { success: false, error: 'Sign out failed.' });
    }
};
