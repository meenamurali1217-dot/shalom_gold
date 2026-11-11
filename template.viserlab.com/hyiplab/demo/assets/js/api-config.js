/**
 * Shalom Gold - API Configuration Helper
 * Resolves API Base URL automatically across local environments.
 */
window.SHALOM_CONFIG = (function() {
    'use strict';
    
    // If hosted on backend server port 5000, use relative paths
    const isPort5000 = window.location.port === '5000';
    const API_BASE = isPort5000 ? '' : 'http://127.0.0.1:5000';

    return {
        API_BASE: API_BASE,
        endpoints: {
            registerLead: API_BASE + '/api/leads/register',
            verifyStatus: API_BASE + '/api/leads/verify-status',
            adminLeads: API_BASE + '/api/admin/leads',
            assignLead: API_BASE + '/api/admin/leads/assign',
            careLeads: API_BASE + '/api/customer-care/leads',
            updateCareLead: API_BASE + '/api/customer-care/leads/update',
            leadHistory: API_BASE + '/api/leads/history',
            exportLeads: API_BASE + '/api/admin/leads/export',
            employees: API_BASE + '/api/employees'
        }
    };
})();
