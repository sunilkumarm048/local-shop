import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
 apiKey: "AIzaSyDiENWyBsHdVCNszjPb_gKT_JqBWxkKPfU",
 authDomain: "local-shop-orders-d48d0.firebaseapp.com",
 projectId: "local-shop-orders-d48d0",
 storageBucket: "local-shop-orders-d48d0.firebasestorage.app",
 messagingSenderId: "750524308284",
 appId: "1:750524308284:web:d2a047c93580635e4e5c39"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
