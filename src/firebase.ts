// prefpack・おでこでお題当て と同じ Firebase Realtime Database を使う。
// データは rooms/kanji-* に置き、ほかのゲームの部屋（rooms/pref-*、rooms/<番号>）とはぶつからない。
// この設定値はブラウザーに配る公開値で、秘密情報ではない。
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

export * from "firebase/database";

const app = initializeApp({
  apiKey: "AIzaSyARjb_t0hEpQKM_6Wmbzl_H7z-e7rMcKjY",
  authDomain: "odeko-ddb38.firebaseapp.com",
  databaseURL: "https://odeko-ddb38-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "odeko-ddb38",
  storageBucket: "odeko-ddb38.firebasestorage.app",
  messagingSenderId: "310865503380",
  appId: "1:310865503380:web:fb1c2b173cb6fbee70c081",
});

export const db = getDatabase(app);
