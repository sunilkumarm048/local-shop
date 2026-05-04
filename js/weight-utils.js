/**
 * Local Shop 路 Weight + delivery fee utilities
 *
 * Vehicle pricing is distance-based:
 *   fee = max(minFee, distanceKm 脳 perKmRate)
 *
 * Vehicles are now loaded dynamically from admin pricing config.
 * Pass the VEHICLES array (from configToVehiclesArray(config)) to fee functions.
 */

export const FALLBACK_KG_PER_UNIT = 0.3;

/* ============== WEIGHT PARSING ============== */

export function parseWeightKg(weightStr){
  if(!weightStr || typeof weightStr !== "string"){
    return FALLBACK_KG_PER_UNIT;
  }
  const s = weightStr.toLowerCase().trim();

  const numMatch = s.match(/(\d+(?:[.,]\d+)?)/);
  if(!numMatch) return FALLBACK_KG_PER_UNIT;
  const num = parseFloat(numMatch[1].replace(",", "."));
  if(isNaN(num) || num <= 0) return FALLBACK_KG_PER_UNIT;

  if(/\b(kg|kgs|kilo|kilos|kilogram|kilograms)\b/.test(s) || /\d\s*kg/.test(s)){
    return num;
  }
  if(/\b(g|gm|gms|gram|grams)\b/.test(s) || /\d\s*g(?![a-z])/.test(s)){
    return num / 1000;
  }
  if(/\b(l|lt|ltr|liter|liters|litre|litres)\b/.test(s) || /\d\s*l(?![a-z])/.test(s)){
    return num;
  }
  if(/\b(ml|mls|milliliter|millilitre)\b/.test(s)){
    return num / 1000;
  }
  if(/\b(pc|pcs|piece|pieces|pack|packs|unit|units|nos|no)\b/.test(s)){
    return num * FALLBACK_KG_PER_UNIT;
  }
  if(/\bdozen\b/.test(s)){
    return num * 12 * FALLBACK_KG_PER_UNIT;
  }
  if(num >= 50){
    return num;
  }
  return FALLBACK_KG_PER_UNIT;
}

export function getCartWeightKg(cartItems){
  let total = 0;
  cartItems.forEach(it => {
    const w = parseWeightKg(it.weight);
    total += w * (it.qty || 1);
  });
  return total;
}

/* ============== STATIC VEHICLES (kept for backwards compatibility) ============== */
/* Kept as a fallback. Pages should import VEHICLES from pricing-config and pass them
   into the fee functions for live admin-controlled values. */

export const VEHICLES = [
  { id:"bike",      name:"2-Wheeler",  icon:"馃浀", maxKg:10,    perKmRate:10, minFee:30,  capacity:"Up to 10 kg",     examples:"Daily groceries 路 small parcels" },
  { id:"3wheeler",  name:"3-Wheeler",  icon:"馃浐", maxKg:500,   perKmRate:14, minFee:100, capacity:"Up to 500 kg",    examples:"Bulk groceries 路 1 AC 路 washing machine" },
  { id:"tataAce",   name:"Tata Ace",   icon:"馃殣", maxKg:750,   perKmRate:18, minFee:200, capacity:"Up to 750 kg",    examples:"1 fridge + 2 cupboards + bed" },
  { id:"pickup8ft", name:"Pickup 8ft", icon:"馃殯", maxKg:1250,  perKmRate:22, minFee:300, capacity:"Up to 1,250 kg",  examples:"Bulk goods 路 2 BHK shifting" },
  { id:"tata407",   name:"Tata 407",   icon:"馃殮", maxKg:2500,  perKmRate:30, minFee:500, capacity:"Up to 2,500 kg",  examples:"Full house 路 construction materials" }
];

/** Smallest vehicle that fits the given weight (uses given vehicle list, defaults to static). */
export function getRequiredVehicle(weightKg, vehicleList = VEHICLES){
  return vehicleList.find(v => weightKg <= v.maxKg) || vehicleList[vehicleList.length - 1];
}

/** Whether a vehicle can carry the given weight. */
export function vehicleFits(vehicleId, weightKg, vehicleList = VEHICLES){
  const v = vehicleList.find(x => x.id === vehicleId);
  return v ? weightKg <= v.maxKg : false;
}

/* ============== DISTANCE & FEE CALCULATION ============== */

/** Haversine distance in km. Returns null if any coord is missing. */
export function haversineKm(lat1, lng1, lat2, lng2){
  if(lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/** Calculate delivery fee. Pass vehicleList from config for live values. */
export function getDeliveryFee(vehicleId, distanceKm, vehicleList = VEHICLES){
  const v = vehicleList.find(x => x.id === vehicleId);
  if(!v) return 0;
  if(distanceKm == null || distanceKm <= 0){
    return v.minFee;
  }
  const calculated = Math.round(distanceKm * v.perKmRate);
  return Math.max(calculated, v.minFee);
}

/** Detailed fee breakdown 鈥?useful for showing "X km 脳 鈧筜 = 鈧筞, min 鈧筗 鈫?鈧筞" */
export function getDeliveryFeeBreakdown(vehicleId, distanceKm, vehicleList = VEHICLES){
  const v = vehicleList.find(x => x.id === vehicleId);
  if(!v) return null;

  if(distanceKm == null || distanceKm <= 0){
    return {
      vehicleId,
      distanceKm: null,
      calculated: 0,
      minApplied: true,
      finalFee: v.minFee,
      perKmRate: v.perKmRate,
      minFee: v.minFee
    };
  }

  const calculated = Math.round(distanceKm * v.perKmRate);
  const minApplied = calculated < v.minFee;
  return {
    vehicleId,
    distanceKm,
    calculated,
    minApplied,
    finalFee: Math.max(calculated, v.minFee),
    perKmRate: v.perKmRate,
    minFee: v.minFee
  };
}
