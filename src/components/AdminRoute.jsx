import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";

export default function AdminRoute({ children }) {
  const { currentUser } = useAuth();
  const [authorized, setAuthorized] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function validateAdmin() {
      if (!currentUser) {
        if (mounted) {
          setAuthorized(false);
        }
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "usuarios", currentUser.uid));
        const profile = snapshot.exists() ? snapshot.data() : null;
        const role = String(profile?.rol || "").trim().toLowerCase();
        const isActive = profile?.activo === true;

        if (mounted) {
          setAuthorized(["admin", "administrador"].includes(role) && isActive);
        }
      } catch (error) {
        console.error("No se pudo validar el acceso administrativo:", error);
        if (mounted) {
          setAuthorized(false);
        }
      }
    }

    validateAdmin();

    return () => {
      mounted = false;
    };
  }, [currentUser]);

  if (authorized === null) {
    return null;
  }

  return authorized ? children : <Navigate to="/" replace />;
}