/**
 * SHALOM GOLD - Mandatory First-Time Visitor Lead Registration Controller
 * Enforces verified lead capture on first visit with secure backend check,
 * strict Indian mobile validation, explicit consent, and 0-dismissal security.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'shalom_lead_verified_token';

    // Modal HTML Template (injected dynamically if not already in DOM)
    const MODAL_HTML = `
    <div id="shalom-visitor-lead-modal" class="shalom-lead-backdrop" role="dialog" aria-modal="true" aria-labelledby="shalomLeadTitle">
        <div class="shalom-lead-card">
            <!-- Normal Registration Form -->
            <div id="shalomLeadFormContainer">
                <div class="shalom-lead-header">
                    <img src="assets/images/logo.png" alt="Shalom Gold" class="shalom-lead-logo">
                    <div>
                        <span class="shalom-lead-pill"><i class="las la-gem mr-1"></i> EXCLUSIVE PRIVILEGE ACCESS</span>
                    </div>
                    <h3 class="shalom-lead-title" id="shalomLeadTitle">Welcome to <span>SHALAM GOLD</span></h3>
                    <p class="shalom-lead-desc">Explore gold savings plans, Hold &amp; Grow opportunities and exclusive jewellery collections.</p>
                </div>

                <!-- Error Alert Box -->
                <div id="shalomLeadError" class="shalom-lead-error" role="alert">
                    <i class="las la-exclamation-circle" style="font-size: 18px;"></i>
                    <span id="shalomLeadErrorText">Please fill in all required fields.</span>
                </div>

                <form id="shalomLeadForm" class="shalom-lead-form" novalidate>
                    <!-- Full Name Field -->
                    <div class="form-group">
                        <label class="shalom-lead-label" for="shalomLeadFullName">
                            Full Name <span style="color: #cca354;">*</span>
                        </label>
                        <div class="shalom-lead-input-wrap">
                            <i class="las la-user shalom-lead-input-icon"></i>
                            <input type="text" id="shalomLeadFullName" class="shalom-lead-input" placeholder="e.g. Rajesh Kumar" required autocomplete="name">
                        </div>
                    </div>

                    <!-- Indian Mobile Number Field -->
                    <div class="form-group">
                        <label class="shalom-lead-label" for="shalomLeadMobile">
                            Indian Mobile Number <span style="color: #cca354;">*</span>
                        </label>
                        <div class="shalom-lead-mobile-wrap">
                            <div class="shalom-lead-country-badge">
                                <span>🇮🇳 +91</span>
                            </div>
                            <input type="tel" id="shalomLeadMobile" class="shalom-lead-mobile-input" placeholder="98765 43210" maxlength="10" required autocomplete="tel-national">
                        </div>
                        <small style="font-size: 11px; color: rgba(255, 255, 255, 0.5); display: block; margin-top: 4px;">10-digit Indian number starting with 6, 7, 8, or 9</small>
                    </div>

                    <!-- Explicit Consent Checkbox -->
                    <div class="shalom-lead-consent-box">
                        <label class="shalom-lead-checkbox-label">
                            <input type="checkbox" id="shalomLeadConsent" required>
                            <span class="shalom-lead-consent-text">
                                I agree to be contacted by SHALAM GOLD regarding my enquiry and understand the 
                                <a href="javascript:void(0)" id="shalomOpenPolicyBtn">Privacy Policy</a>.
                            </span>
                        </label>
                        <span class="shalom-lead-dpdp-note">
                            <i class="las la-shield-alt mr-1" style="color: #cca354;"></i> We collect your details strictly to provide expert consultation on gold accumulation schemes in compliance with the Digital Personal Data Protection (DPDP) Act.
                        </span>
                    </div>

                    <!-- Submit Button -->
                    <button type="submit" id="shalomLeadSubmitBtn" class="shalom-lead-submit-btn">
                        <span>SUBMIT</span>
                        <i class="las la-arrow-right"></i>
                    </button>
                </form>
            </div>

            <!-- Success Animation Container -->
            <div id="shalomLeadSuccessContainer" class="shalom-lead-success-wrap">
                <div class="shalom-lead-success-icon">
                    <i class="las la-check"></i>
                </div>
                <h4 style="color: #ffffff; font-family: 'Playfair Display', serif; font-size: 24px; margin-bottom: 8px;">Registration Verified!</h4>
                <p id="shalomLeadSuccessMessage" style="color: rgba(255, 255, 255, 0.75); font-size: 13.5px; line-height: 1.6; margin-bottom: 0;">
                    Welcome to Shalom Gold. You now have full access to our savings plans, bullion benchmarks, and boutique privileges.
                </p>
            </div>
        </div>
    </div>

    <!-- Nested Privacy Policy Modal -->
    <div id="shalomPolicyModal" class="shalom-policy-modal" role="dialog" aria-modal="true" aria-labelledby="shalomPolicyTitle">
        <div class="shalom-policy-card">
            <div class="shalom-policy-header">
                <h4 id="shalomPolicyTitle"><i class="las la-shield-alt mr-1"></i> Shalom Gold Privacy &amp; Data Policy</h4>
                <button type="button" id="shalomPolicyCloseBtn" class="shalom-policy-close" aria-label="Close policy">&times;</button>
            </div>
            <div class="shalom-policy-body">
                <h6>1. Purpose of Data Collection</h6>
                <p>Shalom Gold collects your Full Name and Mobile Number strictly for the purpose of communicating verified details regarding our 1–5 Year Monthly Gold Savings Schemes, 2% Hold &amp; Grow physical gold custody, franchise expansion privileges, and IBJA bullion delivery.</p>

                <h6>2. Consent &amp; Telemarketing Compliance</h6>
                <p>By checking the explicit consent box, you authorize Shalom Gold's dedicated advisory desk to contact you via telephone call or WhatsApp message regarding your specific enquiry, in full alignment with TRAI Commercial Communications Regulations and the Indian Digital Personal Data Protection (DPDP) Act.</p>

                <h6>3. Confidentiality &amp; Non-Disclosure</h6>
                <p>We enforce strict data isolation. Your personal contact information is never sold, leased, rented, or distributed to any third-party marketing brokers or advertisers.</p>

                <h6>4. Data Rights &amp; Opt-Out</h6>
                <p>You may request modification or erasure of your consultation record at any time by contacting our compliance officer at <strong>privacy@shalomgold.com</strong> or helpline <strong>+91 88888 88888</strong>.</p>
            </div>
        </div>
    </div>
    `;

    // Ensure API configuration is available
    function getApiBase() {
        if (window.SHALOM_CONFIG && window.SHALOM_CONFIG.API_BASE !== undefined) {
            return window.SHALOM_CONFIG.API_BASE;
        }
        return window.location.port === '5000' ? '' : 'http://127.0.0.1:5000';
    }

    // Verify submission status on backend
    async function verifyLeadStatusOnBackend() {
        const token = localStorage.getItem(STORAGE_KEY);
        if (!token) return { registered: false };

        try {
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/api/leads/verify-status?token=${encodeURIComponent(token)}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (res.ok) {
                const data = await res.json();
                return data;
            }
        } catch (e) {
            console.warn('[Shalom Lead Popup] Backend verify check fallback to local token:', e);
            // If offline / local file mode, allow verified localStorage token
            return { registered: true };
        }
        return { registered: false };
    }

    // Main initialization
    async function init() {
        // Step 1: Check if already verified on backend
        const verification = await verifyLeadStatusOnBackend();
        if (verification && verification.registered) {
            // Already verified returning visitor - DO NOT SHOW POPUP
            return;
        }

        // Step 2: Inject modal if not present
        if (!document.getElementById('shalom-visitor-lead-modal')) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = MODAL_HTML;
            document.body.appendChild(wrapper);
        }

        const modalBackdrop = document.getElementById('shalom-visitor-lead-modal');
        const form = document.getElementById('shalomLeadForm');
        const nameInput = document.getElementById('shalomLeadFullName');
        const mobileInput = document.getElementById('shalomLeadMobile');
        const consentCheckbox = document.getElementById('shalomLeadConsent');
        const submitBtn = document.getElementById('shalomLeadSubmitBtn');
        const errorBox = document.getElementById('shalomLeadError');
        const errorText = document.getElementById('shalomLeadErrorText');
        const formContainer = document.getElementById('shalomLeadFormContainer');
        const successContainer = document.getElementById('shalomLeadSuccessContainer');
        const successMessage = document.getElementById('shalomLeadSuccessMessage');
        const policyModal = document.getElementById('shalomPolicyModal');
        const openPolicyBtn = document.getElementById('shalomOpenPolicyBtn');
        const closePolicyBtn = document.getElementById('shalomPolicyCloseBtn');

        // Prevent dismissal: Disable outside clicks & Escape key
        modalBackdrop.addEventListener('click', function (e) {
            if (e.target === modalBackdrop) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modalBackdrop.classList.contains('active')) {
                // If policy modal is open, close policy modal; otherwise DO NOT close lead modal
                if (policyModal && policyModal.classList.contains('active')) {
                    policyModal.classList.remove('active');
                }
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // Privacy Policy Modal handlers
        if (openPolicyBtn && policyModal) {
            openPolicyBtn.addEventListener('click', function (e) {
                e.preventDefault();
                policyModal.classList.add('active');
            });
        }
        if (closePolicyBtn && policyModal) {
            closePolicyBtn.addEventListener('click', function () {
                policyModal.classList.remove('active');
            });
        }
        if (policyModal) {
            policyModal.addEventListener('click', function (e) {
                if (e.target === policyModal) {
                    policyModal.classList.remove('active');
                }
            });
        }

        // Real-time mobile input formatting (digits only, max 10 digits)
        mobileInput.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '');
            // If user pastes +91 or leading 0, strip it cleanly
            if (val.length === 12 && val.startsWith('91')) {
                val = val.substring(2);
            } else if (val.length === 11 && val.startsWith('0')) {
                val = val.substring(1);
            }
            if (val.length > 10) {
                val = val.substring(0, 10);
            }
            this.value = val;
            hideError();
        });

        nameInput.addEventListener('input', hideError);
        consentCheckbox.addEventListener('change', hideError);

        function showError(msg) {
            errorText.textContent = msg;
            errorBox.classList.add('active');
        }

        function hideError() {
            errorBox.classList.remove('active');
        }

        // Form Submit Handler
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideError();

            const fullName = nameInput.value.trim();
            const mobile = mobileInput.value.trim();
            const consentGranted = consentCheckbox.checked;

            // 1. Validate Name
            if (!fullName || fullName.length < 2) {
                showError('Please enter your full name (minimum 2 characters).');
                nameInput.focus();
                return;
            }
            if (!/^[a-zA-Z\s\.\'\-]+$/.test(fullName)) {
                showError('Full name must contain only letters and standard characters.');
                nameInput.focus();
                return;
            }

            // 2. Validate Indian Mobile
            if (!mobile || mobile.length !== 10) {
                showError('Please enter a complete 10-digit Indian mobile number.');
                mobileInput.focus();
                return;
            }
            if (!/^[6-9]\d{9}$/.test(mobile)) {
                showError('Indian mobile numbers must start with 6, 7, 8, or 9.');
                mobileInput.focus();
                return;
            }

            // 3. Validate Consent
            if (!consentGranted) {
                showError('Please check the consent box to proceed with your enquiry.');
                consentCheckbox.focus();
                return;
            }

            // Prevent duplicate clicks
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span> Submitting...';

            try {
                const apiBase = getApiBase();
                const response = await fetch(`${apiBase}/api/leads/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        full_name: fullName,
                        mobile_number: mobile,
                        consent_status: true
                    })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    showError(data.error || 'Registration failed. Please check your details and try again.');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>SUBMIT</span> <i class="las la-arrow-right"></i>';
                    return;
                }

                // Successful submission
                if (data.token) {
                    localStorage.setItem(STORAGE_KEY, data.token);
                }

                // Show Success View
                formContainer.style.display = 'none';
                if (data.message) {
                    successMessage.textContent = data.message;
                }
                successContainer.classList.add('active');

                // Close smoothly after 1.8s
                setTimeout(() => {
                    modalBackdrop.classList.remove('active');
                    setTimeout(() => {
                        modalBackdrop.remove();
                    }, 400);
                }, 1800);

            } catch (err) {
                console.error('[Shalom Lead Popup] Submission Error:', err);
                showError('Network error connecting to server. Please check your connection and retry.');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>SUBMIT</span> <i class="las la-arrow-right"></i>';
            }
        });

        // Show modal smoothly after brief delay
        setTimeout(() => {
            modalBackdrop.classList.add('active');
            nameInput.focus();
        }, 700);
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
