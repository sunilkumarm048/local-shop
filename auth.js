
import { auth } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword }
from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

window.signup = function(){

const email = document.getElementById("email").value;
const password = document.getElementById("password").value;

createUserWithEmailAndPassword(auth,email,password)
.then(()=>alert("Account created"))
.catch(e=>alert(e.message));

}

window.login = function(){

const email = document.getElementById("email").value;
const password = document.getElementById("password").value;

signInWithEmailAndPassword(auth,email,password)
.then(()=>alert("Login successful"))
.catch(e=>alert(e.message));

}
