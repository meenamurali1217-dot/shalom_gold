/**
 * SHALOM GOLD - Production & Local Development Server
 * Serves static files and routes all /api/* requests to Vercel Serverless Handlers.
 * Seamlessly connects to Neon PostgreSQL when DATABASE_URL is set,
 * or local SQLite fallback for offline development.
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./lib/db');

const PORT = process.env.PORT || 5000;
const ROOT_DIR = __dirname;

// Vercel Serverless API Route Map
const API_ROUTES = {
    '/api/leads/register': require('./api/leads/register'),
    '/api/leads/verify-status': require('./api/leads/verify-status'),
    '/api/leads/history': require('./api/leads/history'),
    '/api/auth/login': require('./api/auth/login'),
    '/api/auth/logout': require('./api/auth/logout'),
    '/api/auth/me': require('./api/auth/me'),
    '/api/employees': require('./api/employees'),
    '/api/admin/leads/assign': require('./api/admin/leads'),
    '/api/admin/leads/export': require('./api/admin/leads'),
    '/api/admin/leads': require('./api/admin/leads'),
    '/api/customer-care/leads/update': require('./api/customer-care/leads/update'),
    '/api/customer-care/leads': require('./api/customer-care/leads/index'),
    '/api/admin/migrate': require('./api/admin/migrate')
};

// MIME types
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

// Clean Route Rewrites (mirroring vercel.json)
const REWRITES = {
    '/': '/index.html',
    '/admin': '/admin-leads.html',
    '/admin-leads': '/admin-leads.html',
    '/care': '/care-leads.html',
    '/care-leads': '/care-leads.html',
    '/catalog': '/catalog.html',
    '/login': '/login.html',
    '/dashboard': '/dashboard.html',
    '/plan': '/plan.html',
    '/about': '/about.html',
    '/contact': '/contact.html',
    '/blog': '/blog.html',
    '/registration': '/registration.html',
    '/product-details': '/product-details.html',
    '/product-single': '/product-single.html'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.pathname;

    // Helper functions on res for serverless compatibility
    res.status = function(code) {
        res.statusCode = code;
        return res;
    };
    res.json = function(obj) {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
        res.end(JSON.stringify(obj));
    };
    res.send = function(data) {
        res.end(data);
    };

    // 1. Dispatch API routes
    if (pathname.startsWith('/api/')) {
        // Strip trailing slash
        const cleanPath = pathname.length > 5 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
        const handler = API_ROUTES[cleanPath];

        if (handler) {
            try {
                return await handler(req, res);
            } catch (err) {
                console.error('[API Handler Error]:', err);
                return res.status(500).json({ success: false, error: 'Internal API Server Error: ' + err.message });
            }
        } else {
            return res.status(404).json({ success: false, error: `Endpoint not found: ${pathname}` });
        }
    }

    // 2. Apply URL Rewrites & Normalization
    if (REWRITES[pathname]) {
        pathname = REWRITES[pathname];
    } else if (pathname.startsWith('/template.viserlab.com/hyiplab/demo/assets/')) {
        pathname = pathname.replace('/template.viserlab.com/hyiplab/demo/assets/', '/assets/');
    } else if (pathname.startsWith('/template.viserlab.com/hyiplab/demo/')) {
        pathname = pathname.replace('/template.viserlab.com/hyiplab/demo/', '/');
    }

    // 3. Static File Serving
    let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(ROOT_DIR, safePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const htmlPath = filePath + '.html';
        if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
            filePath = htmlPath;
        } else {
            const alternatePath = path.join(ROOT_DIR, 'template.viserlab.com', 'hyiplab', 'demo', safePath);
            if (fs.existsSync(alternatePath) && !fs.statSync(alternatePath).isDirectory()) {
                filePath = alternatePath;
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
                return res.end('404 Not Found: ' + pathname);
            }
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
});

server.listen(PORT, '0.0.0.0', async () => {
    try {
        await db.initSchema();
    } catch(e) {
        console.warn('[DB Init Notice]:', e.message);
    }
    console.log(`=======================================================`);
    console.log(` SHALOM GOLD Serverless-Compatible API & Static Server`);
    console.log(` Database:    ${db.isNeon() ? 'Neon PostgreSQL (Production)' : 'SQLite (Local Fallback)'}`);
    console.log(` Listening on: http://127.0.0.1:${PORT}`);
    console.log(`=======================================================`);
});

module.exports = server;
