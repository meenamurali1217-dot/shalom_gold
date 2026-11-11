import urllib.request
import os
import re

INDEX_URL = "http://127.0.0.1:5000/template.viserlab.com/hyiplab/demo/index.html"
CSS_URL = "http://127.0.0.1:5000/template.viserlab.com/hyiplab/demo/assets/css/featured-jewellery.css"
JS_URL = "http://127.0.0.1:5000/template.viserlab.com/hyiplab/demo/assets/js/featured-jewellery.js"

def main():
    print("==================================================")
    print(" VERIFYING FEATURED JEWELLERY & BULLION INTEGRATION")
    print("==================================================")

    # 1. Check CSS asset
    with urllib.request.urlopen(CSS_URL) as r:
        assert r.status == 200
        css = r.read().decode("utf-8")
        assert ".featured-jewellery-section" in css
        assert ".jewellery-card" in css
        print("[PASS] 1. featured-jewellery.css served successfully (200).")

    # 2. Check JS asset
    with urllib.request.urlopen(JS_URL) as r:
        assert r.status == 200
        js = r.read().decode("utf-8")
        assert "Vedic Royal Temple Necklace Set" in js
        assert "Padmavati Kundan Jhumka" in js
        assert "PRODUCTS" in js
        print("[PASS] 2. featured-jewellery.js served successfully (200).")

    # 3. Check index.html markup
    with urllib.request.urlopen(INDEX_URL) as r:
        assert r.status == 200
        html = r.read().decode("utf-8")

        assert "featured-jewellery.css" in html
        assert "featured-jewellery.js" in html
        assert "Featured" in html and "Jewellery &amp; Bullion" in html
        assert "100% BIS Hallmarked Pure Gold" in html
        assert "shalomQuickViewModal" in html
        assert "openCatalogBtn" in html

        # Verify all 8 product cards
        products = [
            ("Vedic Royal Temple Necklace Set", "1,84,500", "24.5g", "Bestseller"),
            ("Padmavati Kundan Jhumka Earrings", "38,900", "5.2g", "New"),
            ("Kada Antique Embossed Gold Bangles", "1,12,400", "15.1g", "Exclusive"),
            ("Eternal Solitaire Rose Gold Ring", "48,700", "4.1g", "Trending"),
            ("24K (999) Lakshmi Gold Coin", "79,900", "10g", "999 Pure"),
            ("24K (999) Ganesha Gold Coin", "40,200", "5g", "999 Pure"),
            ("24K (999) Bullion Bar", "3,95,000", "50g", "Exclusive"),
            ("Sacred Bloom Traditional Mangalsutra", "76,500", "9.8g", "Bestseller")
        ]

        for name, price, weight, badge in products:
            assert name in html, f"Missing product {name}"
            assert price in html, f"Missing price {price} for {name}"
            assert weight in html, f"Missing weight {weight} for {name}"
            assert badge in html, f"Missing badge {badge} for {name}"
            print(f" -> Product verified: {name} ({weight}, Rs.{price}, {badge})")

    print("\n==================================================")
    print(" ALL FEATURED JEWELLERY TESTS PASSED! ")
    print("==================================================")

if __name__ == "__main__":
    main()
