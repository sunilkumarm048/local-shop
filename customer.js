
let cart=[];

function addCart(name,price){
cart.push({name,price});
localStorage.setItem("cart",JSON.stringify(cart));
alert("Added to cart");
}

window.onload=function(){
const c = JSON.parse(localStorage.getItem("cart"))||[];
const div=document.getElementById("cart");
if(div){
let html="";
c.forEach(i=>{
html+=i.name+" - ₹"+i.price+"<br>";
});
div.innerHTML=html;
}
}

function placeOrder(){
alert("Order placed (connect Firebase later)");
}
