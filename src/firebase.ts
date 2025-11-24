import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCXkwkxXmqkb1Ioy5YHKKSzEfm8xGUf6Dc",
  authDomain: "autos-215e5.firebaseapp.com",
  projectId: "autos-215e5",
  storageBucket: "autos-215e5.firebasestorage.app",
  messagingSenderId: "595730044714",
  appId: "1:595730044714:web:03024e02ba3e9995573053",
  measurementId: "G-CDYXN3MDDL"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);