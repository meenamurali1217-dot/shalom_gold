/**
 * Shalom Gold - API Configuration Helper
 * Configures all frontend API requests to use same-origin relative endpoints.
 * Never connects to localhost or hardcoded ports in production.
 */
window.SHALOM_CONFIG = (function() {
    'use strict';
    
    // Always use same-origin relative paths on Vercel and local environments
    const API_BASE = '';

    return {
        API_BASE: API_BASE,
        endpoints: {
            registerLead: '/api/leads/register',
            verifyStatus: '/api/leads/verify-status',
            adminLeads: '/api/admin/leads',
            assignLead: '/api/admin/leads/assign',
            careLeads: '/api/customer-care/leads',
            updateCareLead: '/api/customer-care/leads/update',
            leadHistory: '/api/leads/history',
            exportLeads: '/api/admin/leads/export',
            employees: '/api/employees',
            login: '/api/auth/login',
            logout: '/api/auth/logout',
            me: '/api/auth/me'
        }
    };
})();
