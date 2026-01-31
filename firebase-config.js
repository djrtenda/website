// Firebase Configuration for DJR Tenda Salary Management
const firebaseConfig = {
  apiKey: "AIzaSyDBmVXQdwOxQEI1x769sRWqEB-AxQRE750",
  authDomain: "djrtenda-aa2e4.firebaseapp.com",
  projectId: "djrtenda-aa2e4",
  storageBucket: "djrtenda-aa2e4.firebasestorage.app",
  messagingSenderId: "19295205119",
  appId: "1:19295205119:web:09eec8c0cdcc012e2b3eca"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('User signed in:', user.email);
  } else {
    console.log('User signed out');
  }
});

