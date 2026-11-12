/**
 * SHALOM GOLD - Featured Jewellery & Bullion Controller
 * Data & Quick View modal matching dark luxury theme.
 */

(function () {
  'use strict';

  const PRODUCTS = [
    {
      id: "prod-1",
      name: "Vedic Royal Temple Necklace Set",
      category: "NECKLACES",
      purity: "22K",
      weight: "24.5g",
      price: "₹1,84,500",
      oldPrice: "₹1,98,000",
      badge: "Bestseller",
      badgeClass: "badge-bestseller",
      img: "https://images.pexels.com/photos/20858950/pexels-photo-20858950.jpeg?auto=compress&cs=tinysrgb&w=800",
      desc: "A masterpiece of antique South Indian craftsmanship featuring handcrafted motifs of Goddess Lakshmi surrounded by intricate filigree work and auspicious ruby-toned gemstones.",
      hallmark: "BIS-HM-916-MUM-8429",
      makingCharges: "₹14,760 (Available with 0% Making on Swarna Varsha Plan)",
      schemeBenefit: "Eligible for 11+1 Bonus Month Scheme"
    },
    {
      id: "prod-2",
      name: "Padmavati Kundan Jhumka Earrings",
      category: "EARRINGS",
      purity: "22K",
      weight: "5.2g",
      price: "₹38,900",
      oldPrice: "₹42,500",
      badge: "New",
      badgeClass: "badge-new",
      img: "https://images.pexels.com/photos/37601639/pexels-photo-37601639.jpeg?auto=compress&cs=tinysrgb&w=800",
      desc: "Regal 22K gold jhumkas adorned with uncut Polki stones, fine Meenakari enamel on the underside, and cascading freshwater micro-pearl drops.",
      hallmark: "BIS-HM-916-DEL-1092",
      makingCharges: "₹3,110 (Special festive discount applies)",
      schemeBenefit: "Eligible for 11+1 Bonus Month Scheme"
    },
    {
      id: "prod-3",
      name: "Kada Antique Embossed Gold Bangles",
      category: "BANGLES",
      purity: "22K",
      weight: "15.1g",
      price: "₹1,12,400",
      oldPrice: "₹1,24,000",
      badge: "Exclusive",
      badgeClass: "badge-exclusive",
      img: "https://images.pexels.com/photos/37485307/pexels-photo-37485307.jpeg?auto=compress&cs=tinysrgb&w=800",
      desc: "A pair of traditional solid 22K screw-lock kadas intricately carved with floral vines and peacock crests in vintage antique finish.",
      hallmark: "BIS-HM-916-BLR-5571",
      makingCharges: "₹8,990",
      schemeBenefit: "Eligible for 22+2 Wealth Accumulation Plan"
    },
    {
      id: "prod-4",
      name: "Eternal Solitaire Rose Gold Ring",
      category: "RINGS",
      purity: "18K",
      weight: "4.1g",
      price: "₹48,700",
      oldPrice: "₹54,000",
      badge: "Trending",
      badgeClass: "badge-trending",
      img: "https://images.pexels.com/photos/30541169/pexels-photo-30541169.jpeg?auto=compress&cs=tinysrgb&w=800",
      desc: "A contemporary 18K rose gold ring accented with a brilliant-cut certified VVS-EF solitaire, offering subtle sophistication for modern daily luxury.",
      hallmark: "BIS-HM-750-IGI-9932",
      makingCharges: "₹3,890",
      schemeBenefit: "Eligible for 11+1 Bonus Month Scheme"
    },
    {
      id: "prod-5",
      name: "24K (999) Lakshmi Gold Coin - 10 Grams",
      category: "BULLION",
      purity: "24K",
      weight: "10g",
      price: "₹79,900",
      oldPrice: "₹81,500",
      badge: "999 Pure",
      badgeClass: "badge-pure",
      img: "https://images.pexels.com/photos/8442352/pexels-photo-8442352.jpeg?auto=compress&cs=tinysrgb&w=800",
      desc: "Certified 999.0 purity 24 Karat gold coin featuring Goddess Lakshmi with embossed lotuses. Sealed in tamper-proof Certicard packaging with unique serial number and lifetime buyback guarantee.",
      hallmark: "BIS-HM-999-NABL-0010",
      makingCharges: "₹1,500 minting fee only",
      schemeBenefit: "100% Honest Zero-Loss Buyback Guarantee"
    },
    {
      id: "prod-6",
      name: "24K (999) Ganesha Gold Coin - 5 Grams",
      category: "BULLION",
      purity: "24K",
      weight: "5g",
      price: "₹40,200",
      oldPrice: "₹41,000",
      badge: "999 Pure",
      badgeClass: "badge-pure",
      img: "https://images.pexels.com/photos/8442353/pexels-photo-8442353.jpeg?auto=compress&cs=tinysrgb&w=800",
      desc: "Auspicious Lord Ganesha coin in 24 Karat 999 fineness. Perfect for Diwali, Dhanteras, housewarmings, or long-term wealth preservation.",
      hallmark: "BIS-HM-999-NABL-0005",
      makingCharges: "₹800 minting fee only",
      schemeBenefit: "100% Honest Zero-Loss Buyback Guarantee"
    },
    {
      id: "prod-7",
      name: "24K (999) Gold Bullion Bar - 50 Grams",
      category: "BULLION",
      purity: "24K",
      weight: "50g",
      price: "₹3,95,000",
      oldPrice: "₹4,02,000",
      badge: "Exclusive",
      badgeClass: "badge-exclusive",
      img: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=800&q=80",
      desc: "Ultra-pure 999.9 investment bullion bar with micro-laser etched serial ID and assay purity certificate. Zero deduction buyback guarantee at all our branches.",
      hallmark: "BIS-HM-9999-MINT-0050",
      makingCharges: "₹3,000 assay & minting fee",
      schemeBenefit: "Hold & Grow 2% Monthly Payout Eligible"
    },
    {
      id: "prod-8",
      name: "Sacred Bloom Traditional Mangalsutra",
      category: "MANGALSUTRA",
      purity: "22K",
      weight: "9.8g",
      price: "₹76,500",
      oldPrice: "₹83,000",
      badge: "Bestseller",
      badgeClass: "badge-bestseller",
      img: "https://images.pexels.com/photos/32780784/pexels-photo-32780784.jpeg?auto=compress&cs=tinysrgb&w=800",
      desc: "Double-row auspicious black onyx beads hand-knotted with 22K gold wire, holding a divine floral pendant with fine filigree and dangling ghungroo beads.",
      hallmark: "BIS-HM-916-HYD-7123",
      makingCharges: "₹6,120",
      schemeBenefit: "Eligible for 11+1 Bonus Month Scheme"
    }
  ];

  function openQuickView(prod) {
    const modal = document.getElementById('shalomQuickViewModal');
    if (!modal) return;

    document.getElementById('qvImg').src = prod.img;
    document.getElementById('qvImg').alt = prod.name;
    document.getElementById('qvTitle').textContent = prod.name;
    document.getElementById('qvCat').textContent = `${prod.category} • ${prod.purity} BIS HALLMARKED`;
    document.getElementById('qvWeight').textContent = prod.weight;
    document.getElementById('qvPrice').textContent = prod.price;
    document.getElementById('qvOldPrice').textContent = prod.oldPrice;
    document.getElementById('qvDesc').textContent = prod.desc;
    document.getElementById('qvHallmark').textContent = prod.hallmark;
    document.getElementById('qvMaking').textContent = prod.makingCharges;
    document.getElementById('qvScheme').textContent = prod.schemeBenefit;

    const whatsappBtn = document.getElementById('qvWhatsappBtn');
    if (whatsappBtn) {
      const msg = encodeURIComponent(`Hello Shalom Gold, I would like to enquire about the ${prod.name} (${prod.purity}, ${prod.weight}, Price: ${prod.price}).`);
      whatsappBtn.href = `https://wa.me/918888888888?text=${msg}`;
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeQuickView() {
    const modal = document.getElementById('shalomQuickViewModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // Expose PRODUCTS globally so catalog.html and product-details.html can access it
  window.SHALOM_PRODUCTS = PRODUCTS;

  function init() {
    // Bind click events on elements specifically tagged for quick-view modal
    document.querySelectorAll('[data-quickview="true"]').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const id = this.getAttribute('data-id');
        const prod = PRODUCTS.find(p => p.id === id);
        if (prod) {
          openQuickView(prod);
        }
      });
    });

    const closeBtn = document.getElementById('qvCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeQuickView);
    }

    const modal = document.getElementById('shalomQuickViewModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          closeQuickView();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeQuickView();
      }
    });

    // Note: openCatalogBtn now directly links to catalog.html without click hijacking.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
