/**
 * SHALOM GOLD - Serverless Response & Body Parsing Helper
 * Compatible with Vercel serverless environment and standard Node HTTP.
 */

function sendJson(res, statusCode, data, headers = {}) {
    // Vercel / Express style response
    if (typeof res.status === 'function' && typeof res.json === 'function') {
        Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(statusCode).json(data);
    }

    // Standard Node.js http.ServerResponse
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

async function parseBody(req) {
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (e) {
            return {};
        }
    }

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

function handleCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Visitor-Token');

    if (req.method === 'OPTIONS') {
        if (typeof res.status === 'function') {
            return res.status(204).end();
        }
        res.writeHead(204);
        return res.end();
    }
    return false;
}

module.exports = {
    sendJson,
    parseBody,
    handleCors
};
