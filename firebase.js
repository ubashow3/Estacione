// Não são necessárias importações. 'firebase' é uma variável global do script em index.html

const firebaseConfig = {
  apiKey: "AIzaSyBF-7ETPGNvep6lwy85BY6PUvaJ51dWXjk",
  authDomain: "f2sc1dk8gdx2jhzgkxz8uwrmw5w9lh.firebaseapp.com",
  databaseURL: "https://f2sc1dk8gdx2jhzgkxz8uwrmw5w9lh-default-rtdb.firebaseio.com",
  projectId: "f2sc1dk8gdx2jhzgkxz8uwrmw5w9lh",
  storageBucket: "f2sc1dk8gdx2jhzgkxz8uwrmw5w9lh.firebasestorage.app",
  messagingSenderId: "577131065163",
  appId: "1:577131065163:web:e63410b549e8dcb8a142ce"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

export const db = firebase.database();
