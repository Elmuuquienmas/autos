import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; // <--- Agregamos esto importante

const firebaseConfig = {
  apiKey: "AIzaSyCXkwkxXmqkb1Ioy5YHKKSzEfm8xGUf6Dc",
  authDomain: "autos-215e5.firebaseapp.com",
  projectId: "autos-215e5",
  storageBucket: "autos-215e5.firebasestorage.app",
  messagingSenderId: "595730044714",
  appId: "1:595730044714:web:03024e02ba3e9995573053",
  measurementId: "G-CDYXN3MDDL"
};

// Inicializamos la App
const app = initializeApp(firebaseConfig);

// Inicializamos y EXPORTAMOS la base de datos para usarla en los componentes
export const db = getDatabase(app);