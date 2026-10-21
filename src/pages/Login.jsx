import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../public/logo-optimized.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("No se pudo iniciar sesión. Verifica tus credenciales.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="auth-card">
        <div className="login-card-brand">
          <img className="login-logo" src={logo} alt="La Vendimia" />
        </div>
        <div className="login-card-content">
          {error && <p className="error">{error}</p>}
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Ingresando..." : "Acceder"}
            </button>
          </form>
        </div>
        <p className="login-footer">La Vendimia MX © 2026</p>
      </div>
    </div>
  );
}
