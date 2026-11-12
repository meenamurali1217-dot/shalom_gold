/**
 * SHALOM GOLD - Employee Password Setup Utility
 * Usage: node scripts/set-employee-password.js <employee_id_or_email> <new_password>
 * Example: node scripts/set-employee-password.js EMP-ADMIN "MySecretPassword2026!"
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../lib/db');

async function setPassword() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node scripts/set-employee-password.js <employee_id_or_email> <new_password>');
        console.log('Example: node scripts/set-employee-password.js EMP-ADMIN "MySecurePassword2026!"');
        process.exit(1);
    }

    const identifier = args[0].trim();
    const newPassword = args[1];

    if (newPassword.length < 6) {
        console.error('[Error] Password must be at least 6 characters.');
        process.exit(1);
    }

    await db.initSchema();
    const empRes = await db.query(`
        SELECT id, name, role, email FROM employees
        WHERE LOWER(email) = $1 OR UPPER(id) = $2
    `, [identifier.toLowerCase(), identifier.toUpperCase()]);

    if (empRes.rows.length === 0) {
        console.error(`[Error] Employee with ID or Email "${identifier}" not found in database.`);
        process.exit(1);
    }

    const emp = empRes.rows[0];
    const hash = await bcrypt.hash(newPassword, 10);

    await db.query(`UPDATE employees SET password_hash = $1 WHERE id = $2`, [hash, emp.id]);
    console.log(`[Success] Password updated successfully for ${emp.name} (${emp.id}, Role: ${emp.role}).`);
    process.exit(0);
}

setPassword().catch(err => {
    console.error('[Error]:', err);
    process.exit(1);
});
