/**
 * SHALOM GOLD - Authentication & Dynamic Navigation Controller
 * 1. Ensures "Dashboard" is completely hidden before login on public pages.
 * 2. Protects dashboard.html from unauthenticated visitors (redirects to login.html).
 * 3. Dynamically injects Dashboard menu and Logout options only when user is logged in.
 * 4. Handles login / registration session persistence and sign out.
 */

(function () {
    'use strict';

    const AUTH_KEY = 'shalom_logged_in_user';

    function getLoggedInUser() {
        try {
            const raw = localStorage.getItem(AUTH_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setLoggedInUser(identifier) {
        const userObj = {
            username: identifier || 'Valued Client',
            loggedInAt: new Date().toISOString()
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(userObj));
        return userObj;
    }

    function logout() {
        localStorage.removeItem(AUTH_KEY);
        window.location.href = 'login.html';
    }

    // Expose helpers globally
    window.ShalomAuth = {
        getUser: getLoggedInUser,
        setUser: setLoggedInUser,
        logout: logout
    };

    const isDashboardPage = window.location.pathname.endsWith('dashboard.html');
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const isRegisterPage = window.location.pathname.endsWith('registration.html');
    const currentUser = getLoggedInUser();

    // 1. Route Protection for Dashboard
    if (isDashboardPage) {
        if (!currentUser) {
            // Visitor tried to access dashboard without logging in -> redirect to login.html
            window.location.replace('login.html?redirect=dashboard.html');
            return;
        }
    }

    // 2. DOM Ready Navigation Adjustments
    function initNav() {
        const user = getLoggedInUser();
        const mainMenu = document.querySelector('.navbar-nav.main-menu');
        const navRight = document.querySelector('.nav-right');

        // Always remove any stray language dropdown if still present in DOM
        document.querySelectorAll('select.select').forEach(el => el.remove());

        if (user) {
            // USER IS LOGGED IN:
            // If on public pages, dynamically show Dashboard menu if not already present
            if (mainMenu && !document.getElementById('auth-dashboard-menu') && !isDashboardPage) {
                const dashboardLi = document.createElement('li');
                dashboardLi.id = 'auth-dashboard-menu';
                dashboardLi.className = 'menu_has_children';
                dashboardLi.innerHTML = `
                    <a href="dashboard.html" style="color: #cca354; font-weight: 600;">Dashboard</a>
                    <ul class="sub-menu">
                        <li><a href="dashboard.html">Client Passbook</a></li>
                        <li><a href="admin-leads.html"><i class="las la-user-tag mr-1 text-warning"></i> Website Leads</a></li>
                        <li><a href="care-leads.html"><i class="las la-headset mr-1 text-success"></i> Customer Care</a></li>
                    </ul>
                `;

                // Insert before Insights or at the end
                const insightsItem = Array.from(mainMenu.children).find(li => {
                    const text = li.textContent || '';
                    return text.includes('Insights') || text.includes('Contact');
                });

                if (insightsItem) {
                    mainMenu.insertBefore(dashboardLi, insightsItem);
                } else {
                    mainMenu.appendChild(dashboardLi);
                }
            }

            // Update Account Menu Icon in nav-right to indicate active session
            if (navRight) {
                const accLink = navRight.querySelector('.account-menu a');
                if (accLink) {
                    accLink.href = 'dashboard.html';
                    accLink.title = `Signed in as ${user.username || 'Client'} (Click to view Passbook)`;
                }

                // If on dashboard page, add Logout button if not present
                if (isDashboardPage && !document.getElementById('shalomLogoutBtn')) {
                    const logoutBtn = document.createElement('button');
                    logoutBtn.type = 'button';
                    logoutBtn.id = 'shalomLogoutBtn';
                    logoutBtn.className = 'btn btn-sm ml-2';
                    logoutBtn.style.cssText = 'background: rgba(220, 53, 69, 0.15); border: 1px solid rgba(220, 53, 69, 0.4); color: #ff6b6b; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;';
                    logoutBtn.innerHTML = '<i class="las la-sign-out-alt mr-1"></i> Logout';
                    logoutBtn.title = 'Sign out of your gold account';
                    logoutBtn.addEventListener('click', logout);
                    logoutBtn.addEventListener('mouseover', () => { logoutBtn.style.background = '#dc3545'; logoutBtn.style.color = '#fff'; });
                    logoutBtn.addEventListener('mouseout', () => { logoutBtn.style.background = 'rgba(220, 53, 69, 0.15)'; logoutBtn.style.color = '#ff6b6b'; });
                    navRight.appendChild(logoutBtn);
                }
            }
        } else {
            // VISITOR IS NOT LOGGED IN:
            // Ensure any static dashboard menu is removed from public view
            const existingDashboard = document.getElementById('auth-dashboard-menu');
            if (existingDashboard) {
                existingDashboard.remove();
            }

            // Ensure account icon links to login
            if (navRight) {
                const accLink = navRight.querySelector('.account-menu a');
                if (accLink) {
                    accLink.href = 'login.html';
                    accLink.title = 'Sign In to Client Passbook';
                }
            }
        }

        // Login Page Handler
        if (isLoginPage) {
            const loginForm = document.querySelector('form');
            if (loginForm) {
                loginForm.addEventListener('submit', function (e) {
                    e.preventDefault();
                    const inputEl = loginForm.querySelector('input[type="text"]');
                    const val = inputEl ? inputEl.value.trim() : 'Client User';
                    setLoggedInUser(val || 'Client User');

                    // Check redirect param
                    const params = new URLSearchParams(window.location.search);
                    const redirectTo = params.get('redirect') || 'dashboard.html';
                    window.location.href = redirectTo;
                });
            }
        }

        // Registration Page Handler
        if (isRegisterPage) {
            const regForm = document.querySelector('form');
            if (regForm) {
                regForm.addEventListener('submit', function (e) {
                    e.preventDefault();
                    const nameEl = regForm.querySelector('input[type="text"]');
                    const val = nameEl ? nameEl.value.trim() : 'Client User';
                    setLoggedInUser(val || 'Client User');
                    window.location.href = 'dashboard.html';
                });
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNav);
    } else {
        initNav();
    }
})();
