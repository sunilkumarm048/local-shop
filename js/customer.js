import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// GET SHOP
const shop = localStorage.getItem("shop") || "Bakery";

// SET TITLE
const title = document.getElementById("shopTitle");
if(title) title.innerText = shop;

// CART LOAD
let cart = JSON.parse(localStorage.getItem("cart")) || [];

// LOAD PRODUCTS
async function loadProducts(){

const productsDiv = document.getElementById("products");
if(!productsDiv) return;

productsDiv.innerHTML = "Loading...";

try{

const snapshot = await getDocs(collection(db,"products"));

productsDiv.innerHTML = "";

snapshot.forEach(doc => {

let p = doc.data();

if(p.shop === shop){

// fallback image
let img = p.image || "https://via.placeholder.com/150";

let div = document.createElement("div");
div.className = "card";

div.innerHTML = `
<img src="${img}" onerror="this.src='https://via.placeholder.com/150'">
<h3>${p.name}</h3>
<p class="price">₹${p.price}</p>

<div style="display:flex;justify-content:center;gap:8px;margin-top:8px;">
<button onclick="decreaseQty('${p.name}')">-</button>
<span id="qty-${p.name}">0</span>
<button onclick="increaseQty('${p.name}',${p.price})">+</button>
</div>
`;

productsDiv.appendChild(div);

}

});

}catch(e){
productsDiv.innerHTML = "Error loading products";
console.error(e);
}

}

loadProducts();


// ➕ INCREASE
window.increaseQty = function(name,price){

let found = cart.find(i=>i.name===name);

if(found){
found.qty++;
}else{
cart.push({name,price,qty:1});
}

saveCart();
updateUI(name);

};

// ➖ DECREASE
window.decreaseQty = function(name){

let found = cart.find(i=>i.name===name);

if(!found) return;

found.qty--;

if(found.qty <= 0){
cart = cart.filter(i=>i.name!==name);
}

saveCart();
updateUI(name);

};

// SAVE CART
function saveCart(){
localStorage.setItem("cart",JSON.stringify(cart));
updateCart();
}

// UPDATE UI QTY
function updateUI(name){

let el = document.getElementById("qty-"+name);

let item = cart.find(i=>i.name===name);

if(el){
el.innerText = item ? item.qty : 0;
}

}

// UPDATE CART COUNT
function updateCart(){

let count = 0;
cart.forEach(i=> count += i.qty);

let el = document.getElementById("count");
if(el) el.innerText = count;

}

updateCart();


// GO CART
window.goCart = function(){
window.location.href = "cart.html";
};
