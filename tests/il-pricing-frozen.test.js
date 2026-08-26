'use strict';

/**
 * Israeli pricing is frozen.
 *
 * The 2026-08-26 region/tax work made the tax model a per-tenant SETTING. The
 * single biggest risk in that change was silently repricing live Israeli
 * businesses on deploy — a defect nobody would notice until a customer argued
 * about a receipt.
 *
 * Every number below was CAPTURED FROM THE PRE-CHANGE IMPLEMENTATION (a
 * temporary A/B harness ran the old pricing.js from `main` against the new one
 * across every case and settings variant here; all 61 comparisons matched).
 * They are not values anyone chose — they are what the old code did. An
 * inclusive-region total that moves off one of these is a regression, whatever
 * the reason it moved.
 *
 * Add a case when a new pricing input appears. Never edit a number to make a
 * test pass.
 */

const mockProducts = [
  { id: 'p1', name_he: 'פיצה משפחתית', name_en: 'Family Pizza', price: 58 },
  { id: 'p2', name_he: 'קולה',        name_en: 'קולה',          price: 17 },  // legacy backfill
];
const mockAdditions = [
  { name_he: 'זיתים',  name_en: 'Olives', price: 5, product_id: 'p1' },
  { name_he: 'פטריות', name_en: '',       price: 6, product_id: 'p1' },
];
let mockSettings = {};

jest.mock('../src/services/menu-service', () => ({
  getProducts: jest.fn(async () => ({ main: mockProducts })),
}));
jest.mock('../src/services/settings', () => ({
  loadAll: jest.fn(async () => mockSettings),
  get: jest.fn(async () => null),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: mockAdditions }) }) }) }),
}));

const { computeTotal } = require('../src/services/pricing');
const TID = 'aaaaaaaa-0000-0000-0000-000000000001';

const CASES = {
  "single item, pickup": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 1
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "multiple qty": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 3
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "two lines": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 1
      },
      {
        "name": "קולה",
        "qty": 2
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "whole toppings": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 1,
        "toppings": [
          {
            "name": "זיתים"
          },
          {
            "name": "פטריות"
          }
        ]
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "half topping": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 2,
        "toppings": [
          {
            "name": "זיתים",
            "portion": "חצי"
          }
        ]
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "quarter topping": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 1,
        "toppings": [
          {
            "name": "זיתים",
            "portion": "רבע"
          }
        ]
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "delivery, matched zone": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 1
      }
    ],
    "opts": {
      "delivery_method": "delivery",
      "address": "דיזנגוף 5, תל אביב"
    }
  },
  "delivery, unknown city": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 1
      }
    ],
    "opts": {
      "delivery_method": "delivery",
      "address": "רחוב כלשהו, חיפה"
    }
  },
  "unmatched item": {
    "items": [
      {
        "name": "מנה שלא בתפריט",
        "qty": 1,
        "price": 44
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "unknown topping": {
    "items": [
      {
        "name": "פיצה משפחתית",
        "qty": 1,
        "toppings": [
          {
            "name": "אננס",
            "price": 9
          }
        ]
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "partial name match": {
    "items": [
      {
        "name": "משפחתית",
        "qty": 1
      }
    ],
    "opts": {
      "delivery_method": "pickup"
    }
  },
  "empty order": {
    "items": [],
    "opts": {
      "delivery_method": "pickup"
    }
  }
};

const SETTINGS = {
  "bare defaults": {
    "delivery_zones": [
      {
        "city": "תל אביב",
        "fee": 30
      }
    ]
  },
  "legacy vat_rate 18": {
    "vat_rate": 18,
    "delivery_zones": [
      {
        "city": "תל אביב",
        "fee": 30
      }
    ]
  },
  "legacy vat_rate 17": {
    "vat_rate": 17,
    "delivery_zones": [
      {
        "city": "תל אביב",
        "fee": 30
      }
    ]
  },
  "partial topping pcts": {
    "topping_half_pct": 50,
    "topping_quarter_pct": 25,
    "delivery_zones": [
      {
        "city": "תל אביב",
        "fee": 30
      }
    ]
  },
  "flat delivery_price": {
    "delivery_price": 25,
    "delivery_zones": []
  }
};

// Captured from the implementation as it stood before the tax work.
const GOLDEN = [
  {
    "settings": "bare defaults",
    "label": "single item, pickup",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "multiple qty",
    "total": 174,
    "itemsTotal": 174,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "two lines",
    "total": 92,
    "itemsTotal": 92,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "whole toppings",
    "total": 69,
    "itemsTotal": 69,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "half topping",
    "total": 126,
    "itemsTotal": 126,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "quarter topping",
    "total": 63,
    "itemsTotal": 63,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "delivery, matched zone",
    "total": 88,
    "itemsTotal": 58,
    "deliveryFee": 30,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "delivery, unknown city",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": null,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "unmatched item",
    "total": 44,
    "itemsTotal": 44,
    "deliveryFee": 0,
    "unmatched": [
      "מנה שלא בתפריט"
    ]
  },
  {
    "settings": "bare defaults",
    "label": "unknown topping",
    "total": 67,
    "itemsTotal": 67,
    "deliveryFee": 0,
    "unmatched": [
      "תוספת אננס"
    ]
  },
  {
    "settings": "bare defaults",
    "label": "partial name match",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "bare defaults",
    "label": "empty order",
    "total": 0,
    "itemsTotal": 0,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "single item, pickup",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "multiple qty",
    "total": 174,
    "itemsTotal": 174,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "two lines",
    "total": 92,
    "itemsTotal": 92,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "whole toppings",
    "total": 69,
    "itemsTotal": 69,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "half topping",
    "total": 126,
    "itemsTotal": 126,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "quarter topping",
    "total": 63,
    "itemsTotal": 63,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "delivery, matched zone",
    "total": 88,
    "itemsTotal": 58,
    "deliveryFee": 30,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "delivery, unknown city",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": null,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "unmatched item",
    "total": 44,
    "itemsTotal": 44,
    "deliveryFee": 0,
    "unmatched": [
      "מנה שלא בתפריט"
    ]
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "unknown topping",
    "total": 67,
    "itemsTotal": 67,
    "deliveryFee": 0,
    "unmatched": [
      "תוספת אננס"
    ]
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "partial name match",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 18",
    "label": "empty order",
    "total": 0,
    "itemsTotal": 0,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "single item, pickup",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "multiple qty",
    "total": 174,
    "itemsTotal": 174,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "two lines",
    "total": 92,
    "itemsTotal": 92,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "whole toppings",
    "total": 69,
    "itemsTotal": 69,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "half topping",
    "total": 126,
    "itemsTotal": 126,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "quarter topping",
    "total": 63,
    "itemsTotal": 63,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "delivery, matched zone",
    "total": 88,
    "itemsTotal": 58,
    "deliveryFee": 30,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "delivery, unknown city",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": null,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "unmatched item",
    "total": 44,
    "itemsTotal": 44,
    "deliveryFee": 0,
    "unmatched": [
      "מנה שלא בתפריט"
    ]
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "unknown topping",
    "total": 67,
    "itemsTotal": 67,
    "deliveryFee": 0,
    "unmatched": [
      "תוספת אננס"
    ]
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "partial name match",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "legacy vat_rate 17",
    "label": "empty order",
    "total": 0,
    "itemsTotal": 0,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "single item, pickup",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "multiple qty",
    "total": 174,
    "itemsTotal": 174,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "two lines",
    "total": 92,
    "itemsTotal": 92,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "whole toppings",
    "total": 69,
    "itemsTotal": 69,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "half topping",
    "total": 121,
    "itemsTotal": 121,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "quarter topping",
    "total": 59.25,
    "itemsTotal": 59.25,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "delivery, matched zone",
    "total": 88,
    "itemsTotal": 58,
    "deliveryFee": 30,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "delivery, unknown city",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": null,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "unmatched item",
    "total": 44,
    "itemsTotal": 44,
    "deliveryFee": 0,
    "unmatched": [
      "מנה שלא בתפריט"
    ]
  },
  {
    "settings": "partial topping pcts",
    "label": "unknown topping",
    "total": 67,
    "itemsTotal": 67,
    "deliveryFee": 0,
    "unmatched": [
      "תוספת אננס"
    ]
  },
  {
    "settings": "partial topping pcts",
    "label": "partial name match",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "partial topping pcts",
    "label": "empty order",
    "total": 0,
    "itemsTotal": 0,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "single item, pickup",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "multiple qty",
    "total": 174,
    "itemsTotal": 174,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "two lines",
    "total": 92,
    "itemsTotal": 92,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "whole toppings",
    "total": 69,
    "itemsTotal": 69,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "half topping",
    "total": 126,
    "itemsTotal": 126,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "quarter topping",
    "total": 63,
    "itemsTotal": 63,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "delivery, matched zone",
    "total": 83,
    "itemsTotal": 58,
    "deliveryFee": 25,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "delivery, unknown city",
    "total": 83,
    "itemsTotal": 58,
    "deliveryFee": 25,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "unmatched item",
    "total": 44,
    "itemsTotal": 44,
    "deliveryFee": 0,
    "unmatched": [
      "מנה שלא בתפריט"
    ]
  },
  {
    "settings": "flat delivery_price",
    "label": "unknown topping",
    "total": 67,
    "itemsTotal": 67,
    "deliveryFee": 0,
    "unmatched": [
      "תוספת אננס"
    ]
  },
  {
    "settings": "flat delivery_price",
    "label": "partial name match",
    "total": 58,
    "itemsTotal": 58,
    "deliveryFee": 0,
    "unmatched": []
  },
  {
    "settings": "flat delivery_price",
    "label": "empty order",
    "total": 0,
    "itemsTotal": 0,
    "deliveryFee": 0,
    "unmatched": []
  }
];

describe('an Israeli tenant prices exactly as it did before the tax model existed', () => {
  for (const g of GOLDEN) {
    test(`${g.settings} — ${g.label}`, async () => {
      mockSettings = SETTINGS[g.settings];
      const r = await computeTotal(CASES[g.label].items, { ...CASES[g.label].opts, tenantId: TID });
      expect(r.total).toBe(g.total);
      expect(r.itemsTotal).toBe(g.itemsTotal);
      expect(r.deliveryFee).toBe(g.deliveryFee);
      expect(r.unmatched).toEqual(g.unmatched);
      // Inclusive regions never add tax to what is charged, whatever the rate.
      expect(r.total).toBe(r.subtotal);
    });
  }
});
