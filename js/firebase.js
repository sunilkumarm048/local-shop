import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
apiKey: "AIzaSyDiENWyBsHdVCNszjPb_gKT_JqBWxkKPfU",
authDomain: "local-shop-orders-d48d0.firebaseapp.com",
projectId: "local-shop-orders-d48d0",
storageBucket: "local-shop-orders-d48d0.appspot.com",
messagingSenderId: "750524308284",
appId: "1:750524308284:web:d2a047c93580635e4e5c39"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
