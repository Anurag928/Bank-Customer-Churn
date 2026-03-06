import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD68uO33rvTLtdZM-9-IwoK6skQBTA-vPs",
    authDomain: "bank-d7c7d.firebaseapp.com",
    projectId: "bank-d7c7d",
    storageBucket: "bank-d7c7d.firebasestorage.app",
    messagingSenderId: "708856373777",
    appId: "1:708856373777:web:bcb15e1632502e3dcb47b0",
    measurementId: "G-S6ZNB9X1EH",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: "select_account",
});

let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (error) {
    // Analytics can fail on unsupported environments; auth setup still works.
    console.warn("Firebase analytics unavailable:", error);
}

window.firebaseAuth = {
    app,
    auth,
    analytics,
    googleProvider,
};

document.querySelectorAll("[data-google-auth]").forEach((button) => {
    button.addEventListener("click", () => {
        button.classList.add("is-loading");
    });
});
