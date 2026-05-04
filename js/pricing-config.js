/**
 * Local Shop · Pricing config loader
 *
 * Loads platform-wide pricing from Firestore (config/pricing).
 * Falls back to safe defaults if Firestore read fails.
 * Caches in localStorage for 5 minutes to avoid repeated reads on every page load.
 *
 * Admin can edit values via /admin/pricing.html
 */

import { db } from "/local-shop/js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CACHE_KEY = "pricingConfigCache";
const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes

/* Safe defaults — used if Firestore is unreachable or admin hasn't set values yet */
export const DEFAULT_PRICING = {
  vehicles: {
    bike:      { id:"bike",      name:"2-Wheeler",  icon:"🛵", maxKg:10,    perKmRate:10, minFee:30  },
    "3wheeler":{ id:"3wheeler",  name:"3-Wheeler",  icon:"🛺", maxKg:500,   perKmRate:14, minFee:100 },
    tataAce:   { id:"tataAce",   name:"Tata Ace",   icon:"🚐", maxKg:750,   perKmRate:18, minFee:200 },
    pickup8ft: { id:"pickup8ft", name:"Pickup 8ft", icon:"🚛", maxKg:1250,  perKmRate:22, minFee:300 },
    tata407:   { id:"tata407",   name:"Tata 407",   icon:"🚚", maxKg:2500,  perKmRate:30, minFee:500 }
  },
  handlingFee: 5,
  platformFeePercent: 5,
  globalDiscount: {
    enabled: false,
    type: "percent",   // "percent" or "flat"
    value: 0,
    label: ""
  }
};

/** Vehicle order — matters for picking smallest that fits */
export const VEHICLE_ORDER = ["bike", "3wheeler", "tataAce", "pickup8ft", "tata407"];

/**
 * Load pricing config. Returns cached version if fresh, else fetches from Firestore.
 * Always returns a config object (defaults if everything fails).
 */
export async function loadPricingConfig(forceFresh = false){
  /* Try cache first */
  if(!forceFresh){
    try{
      const cached = localStorage.getItem(CACHE_KEY);
      if(cached){
        const parsed = JSON.parse(cached);
        if(parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_TTL_MS){
          return mergeWithDefaults(parsed.data);
        }
      }
    }catch(e){ /* corrupt cache, ignore */ }
  }

  /* Fetch from Firestore */
  try{
    const snap = await getDoc(doc(db, "config", "pricing"));
    let data;
    if(snap.exists()){
      data = snap.data();
    }else{
      /* No doc yet — use defaults */
      data = DEFAULT_PRICING;
    }

    /* Cache it */
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    }catch(e){ /* localStorage might be full, ignore */ }

    return mergeWithDefaults(data);
  }catch(err){
    console.warn("[pricing-config] Could not load from Firestore, using defaults:", err);
    return mergeWithDefaults({});
  }
}

/** Force-refresh next load (call from admin after saving config) */
export function clearPricingCache(){
  try{ localStorage.removeItem(CACHE_KEY); }catch(e){}
}

/** Ensures all keys exist by deep-merging with defaults. */
function mergeWithDefaults(data){
  const merged = JSON.parse(JSON.stringify(DEFAULT_PRICING));
  if(!data) return merged;

  if(data.vehicles && typeof data.vehicles === "object"){
    Object.keys(merged.vehicles).forEach(id => {
      if(data.vehicles[id]){
        merged.vehicles[id] = { ...merged.vehicles[id], ...data.vehicles[id], id };
      }
    });
  }
  if(typeof data.handlingFee === "number") merged.handlingFee = data.handlingFee;
  if(typeof data.platformFeePercent === "number") merged.platformFeePercent = data.platformFeePercent;
  if(data.globalDiscount){
    merged.globalDiscount = { ...merged.globalDiscount, ...data.globalDiscount };
  }
  return merged;
}

/** Convert pricing config to VEHICLES array (for compatibility with checkout.html) */
export function configToVehiclesArray(config){
  return VEHICLE_ORDER.map(id => config.vehicles[id]).filter(Boolean);
}

/**
 * Calculate discount for an order.
 * Per-shop discount overrides global if both apply.
 *
 * @param {number} subtotal  - items total for this shop
 * @param {object} globalDiscount - from pricing config
 * @param {object|null} shopDiscount - from localshop-details.discount (or null)
 * @returns {{ amount:number, label:string, source:"shop"|"global"|"none", type:string, value:number }}
 */
export function calculateDiscount(subtotal, globalDiscount, shopDiscount){
  /* Per-shop wins if enabled */
  if(shopDiscount && shopDiscount.enabled && Number(shopDiscount.value) > 0){
    return applyDiscount(subtotal, shopDiscount, "shop");
  }
  if(globalDiscount && globalDiscount.enabled && Number(globalDiscount.value) > 0){
    return applyDiscount(subtotal, globalDiscount, "global");
  }
  return { amount: 0, label: "", source: "none", type: "", value: 0 };
}

function applyDiscount(subtotal, d, source){
  const value = Number(d.value) || 0;
  let amount = 0;

  if(d.type === "flat"){
    amount = Math.min(value, subtotal);   // can't exceed subtotal
  }else{
    /* percent */
    amount = Math.round(subtotal * value / 100);
  }

  return {
    amount,
    label: d.label || (source === "shop" ? "Shop discount" : "Special offer"),
    source,
    type: d.type,
    value
  };
}
