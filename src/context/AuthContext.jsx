import { createContext, useContext, useEffect, useState } from "react";
import {
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase";

const AuthContext = createContext(null);
let sessionPersistencePromise;

function configureSessionPersistence() {
  if (!sessionPersistencePromise) {
    sessionPersistencePromise = setPersistence(auth, browserSessionPersistence);
  }
  return sessionPersistencePromise;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let mounted = true;
    let unsubscribe;

    async function initializeAuth() {
      try {
        await configureSessionPersistence();
        if (!mounted) return;
        unsubscribe = onAuthStateChanged(auth, (user) => {
          setCurrentUser(user);
          setLoading(false);
        });
      } catch (error) {
        console.error("No se pudo configurar la sesión de autenticación:", error);
        if (mounted) {
          setAuthError("No se pudo configurar la sesión. Revisa la configuración del navegador e inténtalo de nuevo.");
          setLoading(false);
        }
      }
    }

    initializeAuth();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  function login(email, password) {
    if (authError) return Promise.reject(new Error(authError));
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  const value = { currentUser, login, logout, authError };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
