import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import logo from "../public/logo-optimized.png";
import AppNavigation from "../components/AppNavigation";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const salesRole = (role) => ["admin", "administrador", "vendedor"].includes(String(role || "").trim().toLowerCase());

function formatDate(value) {
  if (!value) return "";
  const date = typeof value?.toMillis === "function" ? value.toMillis() : value;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [productos, setProductos] = useState([]);
  const [pallets, setPallets] = useState([]);
  const [apartados, setApartados] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [financeLoading, setFinanceLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setFinanceLoading(true);
      setError("");
      try {
        const [profileSnapshot, productsSnapshot, palletsSnapshot] = await Promise.all([
          getDoc(doc(db, "usuarios", currentUser.uid)),
          getDocs(collection(db, "productos")),
          getDocs(collection(db, "pallets")),
        ]);
        if (!mounted) return;

        const userProfile = profileSnapshot.exists() ? profileSnapshot.data() : null;
        setPerfil(userProfile);
        setProductos(productsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setPallets(palletsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoading(false);

        if (!salesRole(userProfile?.rol) || userProfile?.activo !== true) {
          setFinanceLoading(false);
          return;
        }

        const [activeSessionSnapshot, reservationsSnapshot] = await Promise.all([
          getDoc(doc(db, "configuracionVentas", "sesionActiva")),
          getDocs(query(collection(db, "apartados"), where("estatus", "in", ["APARTADO", "PAGADO"]))),
        ]);
        if (!mounted) return;

        setActiveSessionId(activeSessionSnapshot.data()?.idVenta || "");
        setApartados(reservationsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch (loadError) {
        console.error("No se pudo cargar el resumen del negocio:", loadError);
        if (mounted) setError("No se pudo cargar toda la información del negocio. Verifica la conexión y los permisos de Firestore.");
      } finally {
        if (mounted) {
          setLoading(false);
          setFinanceLoading(false);
        }
      }
    }

    if (currentUser) loadDashboard();
    return () => { mounted = false; };
  }, [currentUser]);

  const nombre = perfil?.nombre || currentUser?.displayName || "Usuario";
  const iniciales = nombre.split(" ").map((parte) => parte[0]).slice(0, 2).join("").toUpperCase();
  const rolActual = String(perfil?.rol || "").trim().toLowerCase();
  const esAdministrador = ["admin", "administrador"].includes(rolActual);
  const puedeOperarVentas = salesRole(rolActual) && perfil?.activo === true;

  const inventario = useMemo(() => productos.reduce((total, producto) => {
    const cantidad = Math.max(0, Number(producto.cantidad ?? 1));
    const estatus = String(producto.estatus || "DISPONIBLE").toUpperCase();
    if (cantidad <= 0 || estatus !== "DISPONIBLE") return total;
    total.productos += 1;
    total.unidades += cantidad;
    total.valor += cantidad * Number(producto.precioVenta || 0);
    if (cantidad <= 2) total.stockBajo.push({ ...producto, cantidad });
    return total;
  }, { productos: 0, unidades: 0, valor: 0, stockBajo: [] }), [productos]);

  const palletsResumen = useMemo(() => pallets.reduce((resumen, pallet) => {
    const status = String(pallet.estatus || "").trim().toLowerCase();
    if (status === "activo") resumen.activos += 1;
    if (status !== "cancelado") {
      resumen.registrados += 1;
      resumen.inversion += Number(pallet.costo || 0) + Number(pallet.envio || 0);
    }
    return resumen;
  }, { activos: 0, registrados: 0, inversion: 0 }), [pallets]);

  const apartadosResumen = useMemo(() => apartados.reduce((resumen, apartado) => {
    const cantidad = Number(apartado.cantidad || 0);
    const importe = cantidad * Number(apartado.precioUnitario || 0);
    if (apartado.estatus === "APARTADO") {
      resumen.pendientes += 1;
      resumen.unidadesPendientes += cantidad;
      resumen.importePendiente += importe;
    } else if (apartado.estatus === "PAGADO") {
      resumen.pagados += 1;
      resumen.unidadesPagadas += cantidad;
      resumen.importePagado += importe;
    }
    return resumen;
  }, {
    pendientes: 0,
    unidadesPendientes: 0,
    importePendiente: 0,
    pagados: 0,
    unidadesPagadas: 0,
    importePagado: 0,
  }), [apartados]);

  const rentabilidad = useMemo(() => {
    const productById = new Map(productos.map((producto) => [producto.id, producto]));
    const resumen = {
      gananciaCobrada: 0,
      gananciaPendiente: 0,
      gananciaInventario: 0,
      unidadesSinCosto: 0,
    };

    function addMargin(product, quantity, price, target) {
      const unitCost = Number(product?.costo);
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        resumen.unidadesSinCosto += quantity;
        return;
      }
      resumen[target] += (Number(price || 0) - unitCost) * quantity;
    }

    for (const reservation of apartados) {
      const quantity = Math.max(0, Number(reservation.cantidad || 0));
      if (quantity === 0) continue;
      const product = productById.get(reservation.idProducto);
      if (reservation.estatus === "PAGADO") {
        addMargin(product, quantity, reservation.precioUnitario, "gananciaCobrada");
      } else if (reservation.estatus === "APARTADO") {
        addMargin(product, quantity, reservation.precioUnitario, "gananciaPendiente");
      }
    }

    for (const product of productos) {
      const quantity = Math.max(0, Number(product.cantidad ?? 1));
      const status = String(product.estatus || "DISPONIBLE").toUpperCase();
      if (quantity > 0 && status === "DISPONIBLE") {
        addMargin(product, quantity, product.precioVenta, "gananciaInventario");
      }
    }

    const gananciaPotencial = resumen.gananciaCobrada + resumen.gananciaPendiente + resumen.gananciaInventario;
    const inversionRegistrada = palletsResumen.inversion;
    const capitalRecuperado = apartadosResumen.importePagado;
    const recuperacionPercent = inversionRegistrada > 0
      ? Math.min(100, Math.max(0, (capitalRecuperado / inversionRegistrada) * 100))
      : 0;

    return {
      ...resumen,
      gananciaPotencial,
      inversionRegistrada,
      capitalRecuperado,
      capitalPorRecuperar: Math.max(0, inversionRegistrada - capitalRecuperado),
      recuperacionPercent,
    };
  }, [apartados, apartadosResumen.importePagado, palletsResumen.inversion, productos]);

  const apartadosRecientes = useMemo(() => [...apartados]
    .filter((apartado) => apartado.estatus === "APARTADO")
    .sort((a, b) => {
      const fechaA = typeof a.fechaApartado?.toMillis === "function" ? a.fechaApartado.toMillis() : Number(a.fechaApartado || 0);
      const fechaB = typeof b.fechaApartado?.toMillis === "function" ? b.fechaApartado.toMillis() : Number(b.fechaApartado || 0);
      return fechaB - fechaA;
    })
    .slice(0, 5), [apartados]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <AppNavigation activePage="dashboard" menuOpen={menuOpen} onClose={setMenuOpen} showUsers={esAdministrador} showSales={puedeOperarVentas} />
      <main className="dashboard-main" id="inicio">
        <header className="topbar">
          <div className="topbar-brand">
            <button className="mobile-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} onClick={() => setMenuOpen((abierto) => !abierto)}>{menuOpen ? "×" : "☰"}</button>
            <img src={logo} alt="La Vendimia" />
          </div>
          <div className="topbar-actions"><button className="avatar profile-avatar-trigger" onClick={() => setProfileOpen((abierto) => !abierto)} aria-label="Abrir perfil" aria-expanded={profileOpen}>{iniciales}</button></div>
        </header>
        {profileOpen && <section className="profile-popover" aria-label="Menú de perfil">
          <div className="profile-popover-head"><span className="avatar profile-popover-avatar">{iniciales}</span><strong>{nombre}</strong><span>{perfil?.rol || "Usuario"}</span><small>{perfil?.email || currentUser?.email}</small></div>
          <div className="profile-popover-links profile-popover-bottom"><button onClick={handleLogout}>↪ <span>Cerrar sesión</span></button></div>
        </section>}

        <section className="business-heading">
          <div><p>LA VENDIMIA MX</p><h1>Resumen del negocio</h1><span>Capital, cobranza y rentabilidad</span></div>
          <div className={`business-live-status${activeSessionId ? " is-open" : ""}`}><i />{financeLoading ? "Cargando ventas…" : activeSessionId ? "ID de Venta activo" : "Sin ID de Venta activo"}</div>
        </section>
        {error && <div className="dashboard-alert" role="alert">{error}</div>}

        {loading ? <div className="business-loading">Cargando resumen...</div> : <>
          <section className="business-metrics operational-metrics" aria-label="Resumen de inventario">
            <article className="business-metric"><span>Productos disponibles</span><strong>{inventario.productos}</strong><small>Claves con existencia</small><i className="metric-mark green" /></article>
            <article className="business-metric"><span>Unidades disponibles</span><strong>{inventario.unidades}</strong><small>En inventario</small><i className="metric-mark blue" /></article>
            <article className="business-metric"><span>Venta potencial del inventario</span><strong>{money.format(inventario.valor)}</strong><small>Unidades disponibles al precio actual</small><i className="metric-mark gold" /></article>
            <article className="business-metric"><span>Pallets activos</span><strong>{palletsResumen.activos}</strong><small>En recepción o venta</small><i className="metric-mark coral" /></article>
          </section>

          {puedeOperarVentas && <>
            <section className="business-finance-section" aria-label="Recuperación del capital">
              <div className="business-finance-heading"><div><p>FLUJO DE CAPITAL</p><h2>Recuperación de la inversión</h2></div></div>
              {financeLoading ? <div className="business-loading">Cargando datos financieros...</div> : <><div className="business-metrics finance-metrics">
                <article className="business-metric"><span>Inversión registrada</span><strong>{money.format(rentabilidad.inversionRegistrada)}</strong><small>Costo + envío de pallets no cancelados</small><i className="metric-mark blue" /></article>
                <article className="business-metric"><span>Capital recuperado</span><strong>{money.format(rentabilidad.capitalRecuperado)}</strong><small>{apartadosResumen.pagados} apartados marcados como pagados</small><i className="metric-mark green" /></article>
                <article className="business-metric"><span>Capital por recuperar</span><strong>{money.format(rentabilidad.capitalPorRecuperar)}</strong><small>Inversión menos cobros registrados</small><i className="metric-mark coral" /></article>
                <article className="business-metric"><span>Pendiente por cobrar</span><strong>{money.format(apartadosResumen.importePendiente)}</strong><small>{apartadosResumen.pendientes} apartados · {apartadosResumen.unidadesPendientes} unidades</small><i className="metric-mark gold" /></article>
              </div>
              <div className="business-capital-progress">
                <div><span>Recuperación del capital invertido</span><strong>{rentabilidad.recuperacionPercent.toFixed(0)}%</strong></div>
                <div className="business-capital-progress-track" role="progressbar" aria-label="Porcentaje de capital recuperado" aria-valuemin="0" aria-valuemax="100" aria-valuenow={rentabilidad.recuperacionPercent}><span style={{ width: `${rentabilidad.recuperacionPercent}%` }} /></div>
              </div></>}
            </section>

            <section className="business-finance-section" aria-label="Proyección de ganancias">
              <div className="business-finance-heading"><div><p>RENTABILIDAD</p><h2>Ganancia bruta por etapa</h2></div></div>
              {financeLoading ? <div className="business-loading">Calculando proyección...</div> : <><div className="business-metrics finance-metrics">
                <article className="business-metric"><span>Ganancia cobrada</span><strong>{money.format(rentabilidad.gananciaCobrada)}</strong><small>Utilidad estimada de apartados pagados</small><i className="metric-mark green" /></article>
                <article className="business-metric"><span>Ganancia por cobrar</span><strong>{money.format(rentabilidad.gananciaPendiente)}</strong><small>Utilidad estimada de apartados pendientes</small><i className="metric-mark gold" /></article>
                <article className="business-metric"><span>Ganancia en inventario</span><strong>{money.format(rentabilidad.gananciaInventario)}</strong><small>Si se vende al precio actual</small><i className="metric-mark blue" /></article>
                <article className="business-metric"><span>Ganancia bruta potencial</span><strong>{money.format(rentabilidad.gananciaPotencial)}</strong><small>Cobrado + pendiente + inventario</small><i className="metric-mark coral" /></article>
              </div>
              <p className="business-finance-note">Utilidad bruta estimada con el costo unitario actual de cada producto; si se edita, cambia la estimación histórica. Excluye {rentabilidad.unidadesSinCosto} unidades sin costo y no descuenta envío ni otros gastos.</p></>}
            </section>
          </>}

          <div className="business-content-grid">
            <section className="business-panel">
              <div className="business-panel-heading"><div><p>INVENTARIO</p><h2>Atención de stock</h2></div><button className="business-link-button" onClick={() => navigate("/productos")}>Ver productos <span aria-hidden="true">→</span></button></div>
              {inventario.stockBajo.length ? <div className="business-stock-list">{inventario.stockBajo.slice(0, 6).map((producto) => <div className="business-stock-row" key={producto.id}><div><strong>{producto.codigoProducto || producto.id}</strong><span>{producto.producto || "Producto sin nombre"}</span></div><b>{producto.cantidad} {producto.cantidad === 1 ? "unidad" : "unidades"}</b></div>)}</div> : <div className="business-empty">No hay productos con dos unidades o menos disponibles.</div>}
            </section>

            {puedeOperarVentas && <section className="business-panel">
              <div className="business-panel-heading"><div><p>VENTAS EN VIVO</p><h2>{financeLoading ? "Cargando actividad" : activeSessionId ? "Actividad pendiente" : "Actividad reciente"}</h2></div><button className="business-link-button" onClick={() => navigate("/ventas")}>Ver apartados <span aria-hidden="true">→</span></button></div>
              {financeLoading ? <div className="business-loading">Cargando actividad de ventas...</div> : apartadosRecientes.length ? <div className="business-reservation-list">{apartadosRecientes.map((apartado) => <article key={apartado.id}><div><strong>{apartado.codigoProducto}</strong><span>{apartado.nombreCliente}</span></div><b>{money.format(Number(apartado.cantidad || 0) * Number(apartado.precioUnitario || 0))}</b><small>{apartado.producto} · {apartado.cantidad} {apartado.cantidad === 1 ? "unidad" : "unidades"} · {formatDate(apartado.fechaApartado)}</small></article>)}</div> : <div className="business-empty">No hay apartados pendientes de pago.</div>}
            </section>}
          </div>

          <section className="business-quick-actions" aria-label="Acciones frecuentes">
            <div><span>Acciones</span><p>Continúa con la operación del negocio.</p></div>
            <button onClick={() => navigate("/productos")}>Abrir catálogo</button>
            {puedeOperarVentas && <button className="primary" disabled={financeLoading} onClick={() => navigate("/venta")}>{financeLoading ? "Cargando venta..." : activeSessionId ? "Continuar venta" : "Iniciar venta"}</button>}
          </section>
        </>}
      </main>
    </div>
  );
}