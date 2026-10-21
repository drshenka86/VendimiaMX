import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../public/logo-optimized.png";
import AppNavigation from "../components/AppNavigation";
import {
  DEFAULT_RECEIPT_PAYMENT_SETTINGS,
  loadReceiptPaymentSettings,
  saveReceiptPaymentSettings,
} from "../utils/receiptPaymentSettings";

const requiredFields = Object.keys(DEFAULT_RECEIPT_PAYMENT_SETTINGS);

export default function ConfiguracionRecibo() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(DEFAULT_RECEIPT_PAYMENT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      setLoading(true);
      setLoadError("");
      try {
        const savedSettings = await loadReceiptPaymentSettings();
        if (mounted) setSettings(savedSettings);
      } catch (loadSettingsError) {
        console.error("No se pudo cargar la configuración del recibo:", loadSettingsError);
        if (mounted) setLoadError("No se pudo cargar la configuración. Verifica tu conexión y las reglas de Firestore.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSettings();
    return () => { mounted = false; };
  }, []);

  const name = currentUser?.displayName || currentUser?.email || "Administrador";
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedSettings = Object.fromEntries(requiredFields.map((key) => [key, String(settings[key] || "").trim()]));
    if (requiredFields.some((key) => !trimmedSettings[key])) {
      showToast("Completa todos los campos antes de guardar.", "error");
      return;
    }
    if (!trimmedSettings.conceptoPago.includes("{cliente}")) {
      showToast("El concepto debe incluir {cliente} para identificar al cliente.", "error");
      return;
    }

    setSaving(true);
    try {
      const savedSettings = await saveReceiptPaymentSettings(trimmedSettings);
      setSettings(savedSettings);
      showToast("Configuración guardada. Los próximos recibos usarán estos datos.");
    } catch (saveError) {
      console.error("No se pudo guardar la configuración del recibo:", saveError);
      showToast("No se pudo guardar la configuración. Verifica tu conexión y tus permisos.", "error");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field, value) {
    setSettings((currentSettings) => ({ ...currentSettings, [field]: value }));
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), type === "error" ? 5000 : 3500);
  }

  return (
    <div className="app-shell receipt-settings-page">
      <AppNavigation activePage="configuracion-recibo" menuOpen={menuOpen} onClose={setMenuOpen} showUsers showSales />
      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-brand">
            <button className="mobile-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button>
            <img src={logo} alt="La Vendimia" />
          </div>
          <div className="topbar-actions">
            <button className="avatar profile-avatar-trigger" onClick={() => setProfileOpen((open) => !open)} aria-label="Abrir perfil" aria-expanded={profileOpen}>{initials}</button>
          </div>
        </header>
        {profileOpen && <section className="profile-popover" aria-label="Menú de perfil">
          <div className="profile-popover-head"><span className="avatar profile-popover-avatar">{initials}</span><strong>{name}</strong><span>Administrador</span><small>{currentUser?.email}</small></div>
          <div className="profile-popover-bottom"><button onClick={handleLogout}>↪ <span>Cerrar sesión</span></button></div>
        </section>}

        <section className="business-heading">
          <div><p>ADMINISTRACIÓN</p><h1>Configuración del recibo</h1><span>Datos de pago que aparecerán en los próximos recibos.</span></div>
        </section>

        {loading ? <div className="business-loading">Cargando configuración...</div> : loadError ? (
          <div className="dashboard-alert" role="alert">{loadError}<button type="button" onClick={() => window.location.reload()}>Reintentar</button></div>
        ) : <form className="receipt-settings-form" onSubmit={handleSubmit}>
          <section className="receipt-settings-section">
            <div className="receipt-settings-section-heading"><div><h2>Datos bancarios</h2><p>Se mostrarán en el recibo de cada cliente.</p></div></div>
            <div className="receipt-settings-grid">
              <label>Banco<input required maxLength={60} value={settings.banco} onChange={(event) => updateField("banco", event.target.value)} /></label>
              <label>Titular de la cuenta<input required maxLength={80} value={settings.titular} onChange={(event) => updateField("titular", event.target.value)} /></label>
              <label>Número de cuenta<input required maxLength={40} value={settings.cuenta} onChange={(event) => updateField("cuenta", event.target.value)} /></label>
              <label>CLABE<input required maxLength={40} value={settings.clabe} onChange={(event) => updateField("clabe", event.target.value)} /></label>
              <label>Tarjeta<input required maxLength={40} value={settings.tarjeta} onChange={(event) => updateField("tarjeta", event.target.value)} /></label>
            </div>
          </section>

          <section className="receipt-settings-section">
            <div className="receipt-settings-section-heading"><div><h2>Instrucciones de pago</h2><p>Personaliza las indicaciones y la referencia para transferencias.</p></div></div>
            <div className="receipt-settings-grid">
              <label className="receipt-settings-field-full">Instrucciones<input required maxLength={80} value={settings.instruccionesPago} onChange={(event) => updateField("instruccionesPago", event.target.value)} /></label>
              <label className="receipt-settings-field-full">Concepto de pago<input required maxLength={100} value={settings.conceptoPago} onChange={(event) => updateField("conceptoPago", event.target.value)} /><small>Incluye <code>{"{cliente}"}</code> para insertar el nombre; <code>{"{idVenta}"}</code> es opcional.</small></label>
            </div>
          </section>

          <div className="receipt-settings-actions"><button className="users-primary-button" type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar configuración"}</button></div>
        </form>}
      </main>
      {toast && <div className={`success-toast${toast.type === "error" ? " error-toast" : ""}`} role={toast.type === "error" ? "alert" : "status"}>{toast.message}</div>}
    </div>
  );
}