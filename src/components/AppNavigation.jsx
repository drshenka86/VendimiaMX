import { Link } from "react-router-dom";

export default function AppNavigation({ activePage, menuOpen, onClose, showUsers, showSales }) {
  const closeMenu = () => onClose(false);

  return (
    <>
      <button
        className={`sidebar-overlay${menuOpen ? " is-visible" : ""}`}
        aria-label="Cerrar menú"
        disabled={!menuOpen}
        onClick={closeMenu}
      />
      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <nav className="main-nav" aria-label="Navegación principal">
          <div className="nav-section">
            <p className="nav-label">GENERAL</p>
            <Link className={`nav-item${activePage === "dashboard" ? " active" : ""}`} to="/" onClick={closeMenu}>
              <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" /></svg></span>
              <span className="nav-label-text">Dashboard</span>
            </Link>
          </div>
          {showSales && <div className="nav-section">
            <p className="nav-label">OPERACIÓN</p>
            <Link className={`nav-item${activePage === "venta" ? " active" : ""}`} to="/venta" onClick={closeMenu}>
              <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5M8 17h3" /></svg></span>
              <span className="nav-label-text">Venta</span>
            </Link>
            <Link className={`nav-item${activePage === "ventas" ? " active" : ""}`} to="/ventas" onClick={closeMenu}>
              <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" /></svg></span>
              <span className="nav-label-text">Apartados</span>
            </Link>
          </div>}
          <div className="nav-section">
            <p className="nav-label">CATÁLOGO</p>
            <Link className={`nav-item${activePage === "productos" ? " active" : ""}`} to="/productos" onClick={closeMenu}>
              <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Zm9 4.5V21m0-9 9 4.5V21l-9-4.5Zm-9 0v9l9 4.5V12.5L3 7.5Z" /></svg></span>
              <span className="nav-label-text">Productos</span>
            </Link>
            {showUsers && <Link className={`nav-item${activePage === "clientes" ? " active" : ""}`} to="/clientes" onClick={closeMenu}>
              <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 11h5m-2.5-2.5v5" /></svg></span>
              <span className="nav-label-text">Clientes</span>
            </Link>}
          </div>
          {showUsers && <div className="nav-section">
            <p className="nav-label">ADMINISTRACIÓN</p>
            <Link className={`nav-item${activePage === "usuarios" ? " active" : ""}`} to="/usuarios" onClick={closeMenu}>
              <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></svg></span>
              <span className="nav-label-text">Usuarios</span>
            </Link>
            <Link className={`nav-item${activePage === "configuracion-recibo" ? " active" : ""}`} to="/configuracion-recibo" onClick={closeMenu}>
              <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" /></svg></span>
              <span className="nav-label-text">Configuración del recibo</span>
            </Link>
          </div>}
        </nav>
      </aside>
    </>
  );
}