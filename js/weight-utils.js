/**
 * Local Shop · Weight parsing utility
 * Parses messy real-world weight strings into kilograms.
 *
 * Examples:
 *   parseWeightKg("500g")       → 0.5
 *   parseWeightKg("1.5 kg")     → 1.5
 *   parseWeightKg("250ml")      → 0.25  (treats as kg, water density)
 *   parseWeightKg("1 dozen")    → 3.6   (12 × 0.3 fallback)
 *   parseWeightKg("1 piece")    → 0.3   (fallback)
 *   parseWeightKg(null)         → 0.3   (fallback)
 */

export const FALLBACK_KG_PER_UNIT = 0.3;

export function parseWeightKg(weightStr){
  if(!weightStr || typeof weightStr !== "string"){
    return FALLBACK_KG_PER_UNIT;
  }
  const s = weightStr.toLowerCase().trim();

  // Match number (allowing decimals/commas)
  const numMatch = s.match(/(\d+(?:[.,]\d+)?)/);
  if(!numMatch){
    return FALLBACK_KG_PER_UNIT;
  }
  const num = parseFloat(numMatch[1].replace(",", "."));
  if(isNaN(num) || num <= 0) return FALLBACK_KG_PER_UNIT;

  // KG variants: "1kg", "1 kg", "1 kilo", "1 kgs", "1 kilogram"
  if(/\b(kg|kgs|kilo|kilos|kilogram|kilograms)\b/.test(s) || /\d\s*kg/.test(s)){
    return num;
  }
  // Gram variants: "500g", "500 gm", "500 gms", "500 grams"
  if(/\b(g|gm|gms|gram|grams)\b/.test(s) || /\d\s*g(?![a-z])/.test(s)){
    return num / 1000;
  }
  // Liter variants (treat 1L ≈ 1kg, water density)
  if(/\b(l|lt|ltr|liter|liters|litre|litres)\b/.test(s) || /\d\s*l(?![a-z])/.test(s)){
    return num;
  }
  // Milliliter variants
  if(/\b(ml|mls|milliliter|millilitre)\b/.test(s)){
    return num / 1000;
  }
  // Counting units — fall back per-piece
  if(/\b(pc|pcs|piece|pieces|pack|packs|unit|units|nos|no)\b/.test(s)){
    return num * FALLBACK_KG_PER_UNIT;
  }
  // Dozen
  if(/\bdozen\b/.test(s)){
    return num * 12 * FALLBACK_KG_PER_UNIT;
  }

  // Number found but no recognized unit — assume the number is in kg if > 50 (likely huge bag of rice etc), else fallback
  if(num >= 50){
    return num;
  }
  return FALLBACK_KG_PER_UNIT;
}

/**
 * Total weight of a cart array.
 * cart items: [{ name, price, qty, weight, ... }]
 */
export function getCartWeightKg(cartItems){
  let total = 0;
  cartItems.forEach(it => {
    const w = parseWeightKg(it.weight);
    total += w * (it.qty || 1);
  });
  return total;
}

/**
 * Vehicle catalog with delivery-fee pricing for cart-based checkout.
 * Different from inter-city Porter pricing — these are short hop delivery fees.
 */
export const VEHICLES = [
  {
    id: "bike",
    name: "2-Wheeler",
    icon: "🛵",
    maxKg: 20,
    deliveryFee: 30,
    capacity: "Up to 20 kg",
    examples: "Daily groceries · small parcels"
  },
  {
    id: "3wheeler",
    name: "3-Wheeler",
    icon: "🛺",
    maxKg: 500,
    deliveryFee: 100,
    capacity: "Up to 500 kg",
    examples: "Bulk groceries · 1 AC · washing machine"
  },
  {
    id: "tataAce",
    name: "Tata Ace",
    icon: "🚐",
    maxKg: 750,
    deliveryFee: 200,
    capacity: "Up to 750 kg",
    examples: "1 fridge + 2 cupboards + bed"
  },
  {
    id: "pickup8ft",
    name: "Pickup 8ft",
    icon: "🚛",
    maxKg: 1250,
    deliveryFee: 300,
    capacity: "Up to 1,250 kg",
    examples: "Bulk goods · 2 BHK shifting"
  },
  {
    id: "tata407",
    name: "Tata 407",
    icon: "🚚",
    maxKg: 2500,
    deliveryFee: 500,
    capacity: "Up to 2,500 kg",
    examples: "Full house · construction materials"
  }
];

/** Smallest vehicle that fits the given weight. */
export function getRequiredVehicle(weightKg){
  return VEHICLES.find(v => weightKg <= v.maxKg) || VEHICLES[VEHICLES.length - 1];
}

/** Whether a vehicle can carry the given weight. */
export function vehicleFits(vehicleId, weightKg){
  const v = VEHICLES.find(x => x.id === vehicleId);
  return v ? weightKg <= v.maxKg : false;
}
