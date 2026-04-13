import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// GLOBAL STATE
let allProducts = [];
let allCategories = [];
let allShops = [];

let selectedCategory = null;
let selectedShop = null;

// LOAD DATA
async function loadData(){
try{

console.log("🚀 Loading...");

const prodSnap = await getDocs(collection(db,"products"));
allProducts = prodSnap.docs.map(d=>d.data());

const catSnap = await getDocs(collection(db,"shops"));
allCategories = catSnap.docs.map(d=>d.data());

const shopSnap = await getDocs(collection(db,"localshop-details"));
allShops = shopSnap.docs.map(d=>d.data());

console.log("✅ Loaded:", allProducts);

renderCategories();
renderShops();
renderProducts();

}catch(e){
console.error("❌ ERROR:", e);
}
}

loadData();

// CATEGORIES
function renderCategories(){
const container = document.getElementById("categories");
container.innerHTML = "";

container.innerHTML += `<div class="cat" onclick="selectCategory(null)">All</div>`;

allCategories.forEach(c=>{
container.innerHTML += `
<div class="cat" onclick="selectCategory('${c.name}')">
${c.icon || ''} ${c.name}
</div>`;
});
}

window.selectCategory = (cat)=>{
selectedCategory = cat;
selectedShop = null;
renderProducts();
renderShops();
}

// SHOPS
function renderShops(){
const container = document.getElementById("shops");
container.innerHTML = "";

let filtered = allShops;

if(selectedCategory){
filtered = filtered.filter(s=>s.category === selectedCategory);
}

filtered.forEach(s=>{
container.innerHTML += `
<div class="shop" onclick="selectShop('${s.shopName}')">
${s.shopName}
</div>`;
});
}

window.selectShop = (shop)=>{
selectedShop = shop;
renderProducts();
}

// PRODUCTS
function renderProducts(){
const container = document.getElementById("products");
container.innerHTML = "";

let filtered = allProducts;

if(selectedCategory){
filtered = filtered.filter(p=>p.category === selectedCategory);
}

if(selectedShop){
filtered = filtered.filter(p=>p.shopName === selectedShop);
}

filtered.forEach(p=>{
container.innerHTML += `
<div class="card">
<h4>${p.name}</h4>
<p>₹${p.price}</p>
</div>`;
});
}
