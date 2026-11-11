import os
import re

DEMO_DIR = r"c:\Users\meena\Downloads\shalom_gold\template.viserlab.com\hyiplab\demo"

PUBLIC_PAGES = ["index.html", "about.html", "plan.html", "contact.html", "blog.html", "blog-details.html"]
ALL_PAGES = PUBLIC_PAGES + ["dashboard.html", "login.html", "registration.html"]

def test_language_option_removed():
    print("[TEST 1] Verifying language dropdown is completely removed...")
    for page in ALL_PAGES:
        path = os.path.join(DEMO_DIR, page)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        assert "<option>ENG</option>" not in content, f"Found ENG in {page}"
        assert "<option>HIN</option>" not in content, f"Found HIN in {page}"
        assert "<option>TEL</option>" not in content, f"Found TEL in {page}"
        assert '<select class="select' not in content, f"Found language select in {page}"
    print(" -> PASS: Language select removed from all HTML pages.")

def test_dashboard_removed_before_login():
    print("[TEST 2] Verifying 'Dashboard' is removed from navbar on public pages...")
    for page in PUBLIC_PAGES:
        path = os.path.join(DEMO_DIR, page)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        # Check navbar main-menu
        navbar_match = re.search(r'<ul class="navbar-nav main-menu m-auto">(.*?)</ul>', content, re.DOTALL)
        assert navbar_match, f"Could not find navbar main-menu in {page}"
        navbar_html = navbar_match.group(1)
        assert "dashboard.html" not in navbar_html, f"Found dashboard.html in main-menu of {page}!"
        assert "Dashboard" not in navbar_html, f"Found 'Dashboard' text in main-menu of {page}!"
    print(" -> PASS: 'Dashboard' menu is completely absent from public navbar before login.")

def test_dashboard_page_protected():
    print("[TEST 3] Verifying dashboard.html has route protection script...")
    dash_path = os.path.join(DEMO_DIR, "dashboard.html")
    with open(dash_path, "r", encoding="utf-8", errors="ignore") as f:
        dash_content = f.read()
    assert "shalom_logged_in_user" in dash_content, "Missing auth check in dashboard.html"
    assert "login.html?redirect=dashboard.html" in dash_content, "Missing redirect to login.html in dashboard.html"
    assert "shalomLogoutBtn" in dash_content, "Missing Logout button in dashboard.html"
    print(" -> PASS: dashboard.html is protected and redirects unauthenticated visitors to login.html.")

def test_auth_nav_script_linked():
    print("[TEST 4] Verifying auth-nav.js is linked across all pages...")
    for page in ALL_PAGES:
        path = os.path.join(DEMO_DIR, page)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        assert "assets/js/auth-nav.js" in content, f"Missing auth-nav.js in {page}"
    print(" -> PASS: auth-nav.js linked in all pages.")

if __name__ == "__main__":
    print("==================================================")
    print(" VERIFYING LANGUAGE OPTION REMOVAL & AUTH NAV")
    print("==================================================")
    test_language_option_removed()
    test_dashboard_removed_before_login()
    test_dashboard_page_protected()
    test_auth_nav_script_linked()
    print("==================================================")
    print(" ALL NAVBAR & AUTH VERIFICATION TESTS PASSED! ")
    print("==================================================")
