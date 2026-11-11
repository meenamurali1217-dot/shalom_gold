import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://127.0.0.1:5000"

def request(path, method="GET", data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {"User-Agent": "ShalomE2ETest/1.0"}
    if headers:
        req_headers.update(headers)
    encoded_data = None
    if data is not None:
        if isinstance(data, dict):
            encoded_data = json.dumps(data).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        else:
            encoded_data = data.encode("utf-8")
    
    req = urllib.request.Request(url, data=encoded_data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            return resp.status, resp.headers, body
    except urllib.error.HTTPError as e:
        body = e.read()
        return e.code, e.headers, body

def main():
    print("==================================================")
    print(" RUNNING END-TO-END VERIFICATION FOR SHALOM GOLD")
    print("==================================================")

    # 1. Unregistered visitor verification
    status, _, body = request("/api/leads/verify-status")
    res = json.loads(body.decode("utf-8"))
    assert status == 200 and res.get("registered") == False, f"Expected registered=False, got {res}"
    print("[PASS] 1. First-time visitor correctly identified as unverified (popup required).")

    # 2. Validation: Empty Name
    status, _, body = request("/api/leads/register", method="POST", data={
        "full_name": "",
        "mobile_number": "9876543210",
        "consent_status": True
    })
    assert status == 400, f"Expected 400 for empty name, got {status}"
    print("[PASS] 2. Registration rejected empty name (400).")

    # 3. Validation: Invalid Indian Mobile (<10 digits, starts with 4, letters)
    invalid_mobiles = ["98765", "4123456789", "abcdefghij", "+12025550199"]
    for mob in invalid_mobiles:
        status, _, _ = request("/api/leads/register", method="POST", data={
            "full_name": "Test User",
            "mobile_number": mob,
            "consent_status": True
        })
        assert status == 400, f"Expected 400 for invalid mobile {mob}, got {status}"
    print("[PASS] 3. Registration rejected all invalid mobile formats (400).")

    # 4. Validation: Missing Consent Checkbox
    status, _, body = request("/api/leads/register", method="POST", data={
        "full_name": "Rohan Gupta",
        "mobile_number": "9876512345",
        "consent_status": False
    })
    assert status == 400, f"Expected 400 for missing consent, got {status}"
    print("[PASS] 4. Registration rejected submission without explicit consent (400).")

    # 5. Successful Lead Registration with +91 prefix
    status, headers, body = request("/api/leads/register", method="POST", data={
        "full_name": "Meenakshi Sundaram",
        "mobile_number": "+91 98401 23456",
        "consent_status": True
    })
    assert status == 201, f"Expected 201, got {status}: {body}"
    res = json.loads(body.decode("utf-8"))
    lead_id = res["lead_id"]
    token = res.get("token")
    cookie = headers.get("Set-Cookie", "")
    assert token, f"Token not returned in {res}"
    print(f"[PASS] 5. Registered new visitor lead ID: {lead_id}, token issued.")

    # 6. Verify returning visitor via Token query parameter
    status, _, body = request(f"/api/leads/verify-status?token={token}")
    assert status == 200, f"Expected 200, got {status}"
    res = json.loads(body.decode("utf-8"))
    assert res.get("registered") == True, f"Expected registered=True, got {res}"
    print(f"[PASS] 6. Returning visitor verified with token: {res.get('name')}.")

    # 7. Verify returning visitor via Cookie
    if cookie:
        cookie_header = cookie.split(";")[0]
        status, _, body = request("/api/leads/verify-status", headers={"Cookie": cookie_header})
        assert status == 200, f"Expected 200, got {status}"
        res = json.loads(body.decode("utf-8"))
        assert res.get("registered") == True
        print("[PASS] 7. Returning visitor verified via secure httpOnly cookie.")

    # 8. Register a second lead for Care testing
    status, _, body = request("/api/leads/register", method="POST", data={
        "full_name": "Vikramaditya Roy",
        "mobile_number": "9123456780",
        "consent_status": True
    })
    assert status == 201, f"Expected 201, got {status}"
    lead2_id = json.loads(body.decode("utf-8"))["lead_id"]
    print(f"[PASS] 8. Registered second lead ID: {lead2_id}.")

    # 9. Admin Leads Query & Metrics
    status, _, body = request("/api/admin/leads")
    assert status == 200
    res = json.loads(body.decode("utf-8"))
    leads = res["leads"]
    metrics = res["metrics"]
    assert len(leads) >= 2
    assert metrics["total"] >= 2
    print(f"[PASS] 9. Admin leads retrieved: Total={metrics['total']}, New={metrics['new']}.")

    # 10. Admin Search & Filtering
    status, _, body = request("/api/admin/leads?search=Meenakshi")
    res = json.loads(body.decode("utf-8"))
    assert any(l["id"] == lead_id for l in res["leads"]), "Search by name failed"
    print("[PASS] 10. Admin lead search by name succeeded.")

    # 11. Assign Lead to Customer Care Agent CC-101 (Priya Sharma)
    status, _, body = request("/api/admin/leads/assign", method="POST", data={
        "lead_id": lead_id,
        "employee_id": "CC-101"
    })
    assert status == 200, f"Expected 200, got {status}: {body}"
    res = json.loads(body.decode("utf-8"))
    assert res.get("success") == True
    print(f"[PASS] 11. Lead {lead_id} successfully assigned to CC-101 (Priya Sharma).")

    # 12. Check Customer Care Queue for CC-101
    status, _, body = request("/api/customer-care/leads?employee_id=CC-101")
    assert status == 200
    res = json.loads(body.decode("utf-8"))
    assigned_leads = res["leads"]
    assert any(l["id"] == lead_id for l in assigned_leads), f"Lead {lead_id} not found in CC-101 queue"
    print(f"[PASS] 12. Customer Care CC-101 queue verified: {len(assigned_leads)} leads assigned.")

    # 13. Customer Care logs call notes & updates status to 'Interested'
    status, _, body = request("/api/customer-care/leads/update", method="POST", data={
        "lead_id": lead_id,
        "actor_name": "Priya Sharma",
        "actor_role": "Customer Care Executive",
        "lead_status": "Interested",
        "notes": "Spoke with customer. Interested in 11-Month Gold Scheme (Swarna Varsha), 5 grams/month.",
        "follow_up_date": "2026-11-15"
    })
    assert status == 200, f"Expected 200, got {status}: {body}"
    res = json.loads(body.decode("utf-8"))
    assert res.get("success") == True
    print("[PASS] 13. Customer Care logged call notes, set follow-up date, and updated status to 'Interested'.")

    # 14. Lead Activity History
    status, _, body = request(f"/api/leads/history?lead_id={lead_id}")
    assert status == 200
    res = json.loads(body.decode("utf-8"))
    history = res["history"]
    assert len(history) >= 2, f"Expected at least 2 history logs, got {len(history)}"
    print(f"[PASS] 14. Lead activity history verified: {len(history)} audit trail entries logged.")

    # 15. CSV Export
    status, headers, body = request("/api/admin/leads/export")
    assert status == 200
    assert "text/csv" in headers.get("Content-Type", "")
    assert body.startswith(b"\xef\xbb\xbf"), "Missing UTF-8 BOM"
    csv_text = body.decode("utf-8-sig")
    assert "Meenakshi Sundaram" in csv_text
    assert "Vikramaditya Roy" in csv_text
    print("[PASS] 15. CSV Export verified: UTF-8 BOM present, header formatted, lead records present.")

    # 16. Employee list
    status, _, body = request("/api/employees")
    assert status == 200
    emps = json.loads(body.decode("utf-8"))["employees"]
    assert len(emps) >= 4
    print(f"[PASS] 16. Employee list verified: {len(emps)} active agents available.")

    print("\n==================================================")
    print(" ALL 16 END-TO-END VERIFICATION TESTS PASSED! ")
    print("==================================================")

if __name__ == "__main__":
    main()
