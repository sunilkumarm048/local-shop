import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// GET SHOP
const shop = localStorage.getItem("shop") || "Bakery";

// SET TITLE
const title = document.getElementById("shopTitle");
if(title) title.innerText = shop;

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

productsDiv.innerHTML += `
<div class="card">
<img src="${p.image || 'https://via.placeholder.com/150'}">
<h3>${p.name}</h3>
<p class="price">₹${p.price}</p>
<button onclick="addToCart('${p.name}',${p.price})">Add</button>
</div>
`;

}

});

}catch(e){
productsDiv.innerHTML = "Error loading products";
console.error(e);
}

}

loadProducts();

// CART
let cart = JSON.parse(localStorage.getItem("cart")) || [];

window.addToCart = function(name,price){

let found = cart.find(i=>i.name===name);

if(found){
found.qty++;
}else{
cart.push({name,price,qty:1});
}

localStorage.setItem("cart",JSON.stringify(cart));
updateCart();

};

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
