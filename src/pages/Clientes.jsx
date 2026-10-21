import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, query as firestoreQuery, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, functions } from "../firebase";
import logo from "../public/logo-optimized.png";
import SearchHighlight from "../components/SearchHighlight";
import AppNavigation from "../components/AppNavigation";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const normalizeSearch = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es-MX");

const sortClients = (clients) => [...clients].sort((left, right) =>
  String(left.nombre || "").localeCompare(String(right.nombre || ""), "es-MX", { sensitivity: "base" }));

export default function Clientes() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [query, setQuery] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [clienteAEliminar, setClienteAEliminar] = useState(null);
  const [apartadosActivosCliente, setApartadosActivosCliente] = useState(null);
  const [errorApartado, setErrorApartado] = useState("");
  const [editingClient, setEditingClient] = useState(null);
  const [form, setForm] = useState({ nombre: "", codigoPais: "+52", celular: "", aceptaWhatsApp: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadClients() {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const [profileSnapshot, clientsSnapshot] = await Promise.all([
          getDoc(doc(db, "usuarios", currentUser.uid)),
          getDocs(collection(db, "clientes")),
        ]);
        if (!mounted) return;

        setPerfil(profileSnapshot.exists() ? profileSnapshot.data() : null);
        setClientes(sortClients(clientsSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }))));
        if (!profileSnapshot.exists()) setError("No se encontró el perfil del usuario.");
      } catch (loadError) {
        console.error(loadError);
        if (mounted) {
          setClientes([]);
          setError(`No se pudieron consultar los clientes (${loadError?.code || "unknown"}).`);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadClients();
    return () => { mounted = false; };
  }, [currentUser]);

  const nombre = perfil?.nombre || currentUser?.displayName || "Usuario";
  const iniciales = nombre.split(" ").map((parte) => parte[0]).slice(0, 2).join("").toUpperCase();
  const clientesFiltrados = useMemo(() => {
    const search = normalizeSearch(query.trim());
    if (!search) return clientes;
    return clientes.filter((cliente) => normalizeSearch(`${cliente.id} ${cliente.nombre} ${cliente.codigoPais || "+52"} ${cliente.celular || ""}`).includes(search));
  }, [clientes, query]);
  const totalClientPages = Math.max(1, Math.ceil(clientesFiltrados.length / 10));
  const paginaClientes = Math.min(clientPage, totalClientPages);
  const clientesVisibles = clientesFiltrados.slice((paginaClientes - 1) * 10, paginaClientes * 10);

  useEffect(() => {
    setClientPage(1);
  }, [query]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function openNewClient() {
    setEditingClient(null);
    setForm({ nombre: "", codigoPais: "+52", celular: "", aceptaWhatsApp: false });
    setModalOpen(true);
  }

  function openEditClient(cliente) {
    setEditingClient(cliente);
    setForm({ nombre: cliente.nombre || "", codigoPais: cliente.codigoPais || "+52", celular: cliente.celular || "", aceptaWhatsApp: cliente.aceptaWhatsApp === true });
    setModalOpen(true);
  }

  function closeClientModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingClient(null);
    setForm({ nombre: "", codigoPais: "+52", celular: "", aceptaWhatsApp: false });
  }

  async function handleSaveClient(event) {
    event.preventDefault();
    const nombreCliente = form.nombre.trim();
    if (!nombreCliente) return;
    const codigoPais = form.codigoPais.trim();
    if (!/^\+[1-9]\d{0,2}$/.test(codigoPais)) {
      setToastError("Ingresa un código de país válido, por ejemplo +52.");
      window.setTimeout(() => setToastError(""), 4500);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const celular = form.celular.replace(/\D/g, "").slice(0, 15) || null;
      const aceptaWhatsApp = form.aceptaWhatsApp && Boolean(celular);
      if (form.aceptaWhatsApp && !celular) {
        setToastError("Agrega el número del cliente antes de guardar su consentimiento de WhatsApp.");
        window.setTimeout(() => setToastError(""), 4500);
        return;
      }
      const whatsappConsentAt = aceptaWhatsApp ? serverTimestamp() : null;
      if (editingClient) {
        const changes = { id: editingClient.id, nombre: nombreCliente, codigoPais, celular, aceptaWhatsApp, whatsappConsentAt };
        await updateDoc(doc(db, "clientes", editingClient.id), changes);
        setClientes((current) => sortClients(current.map((cliente) => cliente.id === editingClient.id ? { ...cliente, ...changes } : cliente)));
        setToast("Cliente modificado correctamente");
      } else {
        const clientRef = doc(collection(db, "clientes"));
        const client = {
          id: clientRef.id,
          nombre: nombreCliente,
          codigoPais,
          celular,
          aceptaWhatsApp,
          whatsappConsentAt,
          fecha_alta: serverTimestamp(),
          creadoPor: currentUser.uid,
        };
        await setDoc(clientRef, client);
        setClientes((current) => sortClients([...current, { ...client, fecha_alta: Date.now() }]));
        setToast("Cliente creado correctamente");
      }
      setModalOpen(false);
      setEditingClient(null);
      setForm({ nombre: "", codigoPais: "+52", celular: "", aceptaWhatsApp: false });
      window.setTimeout(() => setToast(""), 3500);
    } catch (saveError) {
      console.error(saveError);
      setToastError(`No se pudo guardar el cliente (${saveError?.code || "unknown"}).`);
      window.setTimeout(() => setToastError(""), 4500);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient() {
    if (!clienteAEliminar?.id) return;

    setSaving(true);
    try {
      let reservationsSnapshot;
      try {
        reservationsSnapshot = await getDocs(firestoreQuery(
          collection(db, "apartados"),
          where("idCliente", "==", clienteAEliminar.id),
        ));
      } catch (queryError) {
        console.error("No se pudieron consultar los apartados del cliente:", queryError);
        const code = String(queryError?.code || "").split("/").pop();
        const message = code === "permission-denied"
          ? "No hay permiso para consultar los apartados. Verifica las reglas publicadas de Firestore."
          : queryError?.message || "Ocurrió un error al consultar los apartados.";
        setToastError(`${message} (${code || "sin código"}).`);
        window.setTimeout(() => setToastError(""), 6000);
        return;
      }

      const activeReservations = reservationsSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((reservation) => reservation.estatus === "APARTADO");
      if (activeReservations.length) {
        setApartadosActivosCliente(activeReservations);
        setErrorApartado("");
        return;
      }

      try {
        const deleteClientSafely = httpsCallable(functions, "deleteClientSafely");
        await deleteClientSafely({ clientId: clienteAEliminar.id });
        setClientes((current) => current.filter((cliente) => cliente.id !== clienteAEliminar.id));
        setClienteAEliminar(null);
        setApartadosActivosCliente(null);
        setToast("Cliente eliminado correctamente");
        window.setTimeout(() => setToast(""), 3500);
      } catch (deleteError) {
        console.error("No se pudo eliminar el documento del cliente:", deleteError);
        const code = String(deleteError?.code || "").split("/").pop();
        const message = code === "failed-precondition"
          ? "No se puede eliminar el cliente mientras tenga apartados pendientes."
          : code === "permission-denied"
          ? "Firestore rechazó la eliminación. Verifica que estén publicadas las reglas que permiten a administradores borrar clientes."
          : deleteError?.message || "Ocurrió un error al eliminar el cliente.";
        setToastError(`${message} (${code || "sin código"}).`);
        window.setTimeout(() => setToastError(""), 6000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUnassignClientReservation(reservation) {
    if (!clienteAEliminar?.id || !reservation?.id) return;

    setSaving(true);
    setErrorApartado("");
    try {
      const reservationRef = doc(db, "apartados", reservation.id);
      const productRef = doc(db, "productos", reservation.idProducto);
      const sessionRef = doc(db, "sesionesVenta", reservation.idVenta);
      const removedReservation = await runTransaction(db, async (transaction) => {
        const [reservationSnapshot, productSnapshot, sessionSnapshot] = await Promise.all([
          transaction.get(reservationRef),
          transaction.get(productRef),
          transaction.get(sessionRef),
        ]);
        if (!reservationSnapshot.exists() || !productSnapshot.exists() || !sessionSnapshot.exists()) {
          throw new Error("No se encontró el apartado, el producto o la sesión. Actualiza e inténtalo de nuevo.");
        }

        const savedReservation = reservationSnapshot.data();
        const product = productSnapshot.data();
        const session = sessionSnapshot.data();
        if (savedReservation.idCliente !== clienteAEliminar.id || savedReservation.estatus !== "APARTADO") {
          throw new Error("Este apartado ya no está activo para este cliente.");
        }
        if (session.estatus !== "ABIERTA" || Number(session.apartadosActivos || 0) < 1) {
          throw new Error("El ID de Venta está cerrado; este apartado no se puede eliminar desde aquí.");
        }

        const restoredQuantity = Number(product.cantidad ?? 0) + Number(savedReservation.cantidad);
        if (!Number.isSafeInteger(restoredQuantity) || restoredQuantity < 1) {
          throw new Error("No se pudo calcular la existencia que debe restaurarse.");
        }

        transaction.delete(reservationRef);
        transaction.update(sessionRef, {
          apartadosActivos: Number(session.apartadosActivos) - 1,
          ultimoApartadoId: reservationRef.id,
        });
        transaction.update(productRef, {
          cantidad: restoredQuantity,
          estatus: "DISPONIBLE",
          ultimaAsignacionId: reservationRef.id,
        });

        return {
          ...savedReservation,
          cantidadDisponible: restoredQuantity,
        };
      });

      setApartadosActivosCliente((current) => current?.filter((item) => item.id !== reservation.id) || []);
      setToast(`${removedReservation.codigoProducto || removedReservation.producto} se eliminó del apartado y volvió al inventario.`);
      window.setTimeout(() => setToast(""), 3500);
    } catch (unassignError) {
      console.error(unassignError);
      const code = String(unassignError?.code || "").split("/").pop();
      const message = unassignError?.message || (code === "permission-denied"
        ? "Firebase no autorizó la operación. Verifica las reglas publicadas y que este apartado sea la última asignación del producto."
        : `No se pudo eliminar el apartado (${code || "error"}).`);
      setErrorApartado(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell users-page clients-page">
      <AppNavigation activePage="clientes" menuOpen={menuOpen} onClose={setMenuOpen} showUsers showSales showClients />

      <main className="dashboard-main" id="clientes">
        <header className="topbar">
          <div className="topbar-brand"><button className="mobile-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button><img src={logo} alt="La Vendimia" /></div>
          <div className="topbar-actions"><button className="avatar profile-avatar-trigger" onClick={() => setProfileOpen((open) => !open)} aria-label="Abrir perfil" aria-expanded={profileOpen}>{iniciales}</button></div>
        </header>
        {profileOpen && <section className="profile-popover" aria-label="Menú de perfil"><div className="profile-popover-head"><span className="avatar profile-popover-avatar">{iniciales}</span><strong>{nombre}</strong><span>{perfil?.rol || "Administrador"}</span><small>{perfil?.email || currentUser?.email}</small></div><div className="profile-popover-bottom"><button onClick={handleLogout}>↪ <span>Cerrar sesión</span></button></div></section>}

        <section className="users-heading"><div><h1>Clientes</h1><p>Administra los datos de contacto de tus clientes.</p></div><button className="users-primary-button" onClick={openNewClient}>＋ Nuevo cliente</button></section>
        {error && <div className="dashboard-alert" role="alert">{error}</div>}
        <section className="users-card">
          <div className="users-toolbar"><label className="users-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente..." aria-label="Buscar cliente por nombre, celular o ID" /></label><span className="users-count">{clientesFiltrados.length} clientes</span></div>
          <div className="users-table-wrap">{loading ? <div className="users-empty">Cargando clientes...</div> : clientesVisibles.length ? <table className="users-table"><thead><tr><th>Nombre</th><th>Celular / WhatsApp</th><th>ID</th><th>Acciones</th></tr></thead><tbody>{clientesVisibles.map((cliente) => <tr key={cliente.id}><td data-label="Nombre"><strong><SearchHighlight value={cliente.nombre || "Sin nombre"} query={query} /></strong></td><td data-label="Celular / WhatsApp"><span className="user-email-value"><SearchHighlight value={cliente.celular ? `${cliente.codigoPais || "+52"} ${cliente.celular}` : "Sin celular"} query={query} /></span></td><td data-label="ID"><span className="user-email-value"><SearchHighlight value={cliente.id} query={query} /></span></td><td data-label="Acciones"><button className="table-action" onClick={() => openEditClient(cliente)}>Editar</button><button className="table-action danger" onClick={() => { setApartadosActivosCliente(null); setClienteAEliminar(cliente); }}>Eliminar</button></td></tr>)}</tbody></table> : <div className="users-empty">{query ? "No hay clientes que coincidan con la búsqueda." : "No hay clientes registrados."}</div>}</div>
          <div className="users-footer"><span>Mostrando {clientesFiltrados.length ? (paginaClientes - 1) * 10 + 1 : 0}-{Math.min(paginaClientes * 10, clientesFiltrados.length)} de {clientesFiltrados.length}</span><div className="pagination"><button disabled={paginaClientes === 1} onClick={() => setClientPage((page) => Math.max(1, page - 1))} aria-label="Página anterior">‹</button><button className="current" aria-current="page">{paginaClientes}</button><button disabled={paginaClientes === totalClientPages} onClick={() => setClientPage((page) => Math.min(totalClientPages, page + 1))} aria-label="Página siguiente">›</button></div></div>
        </section>
      </main>

      {modalOpen && <div className="modal-overlay" role="presentation"><form className="user-modal" role="dialog" aria-modal="true" aria-labelledby="client-modal-title" onClick={(event) => event.stopPropagation()} onSubmit={handleSaveClient}><button type="button" className="modal-close" onClick={closeClientModal} aria-label="Cerrar" disabled={saving}>×</button><h2 id="client-modal-title">{editingClient ? "Editar cliente" : "Nuevo cliente"}</h2><label>Nombre completo<input required maxLength={150} autoFocus value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} placeholder="Nombre completo" /></label><div className="client-phone-fields"><label htmlFor="client-country-code">Código de país<input id="client-country-code" required type="tel" inputMode="tel" maxLength={4} pattern="\+[1-9][0-9]{0,2}" value={form.codigoPais} onChange={(event) => setForm((current) => ({ ...current, codigoPais: event.target.value, aceptaWhatsApp: current.codigoPais === event.target.value ? current.aceptaWhatsApp : false }))} placeholder="+52" /></label><label htmlFor="client-phone-number">Celular / WhatsApp<input id="client-phone-number" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} value={form.celular} onChange={(event) => setForm((current) => ({ ...current, celular: event.target.value, aceptaWhatsApp: current.celular === event.target.value ? current.aceptaWhatsApp : false }))} placeholder="Número de contacto" /></label></div><label className="whatsapp-consent-field"><input type="checkbox" checked={form.aceptaWhatsApp} onChange={(event) => setForm((current) => ({ ...current, aceptaWhatsApp: event.target.checked }))} />El cliente autorizó recibir recibos por WhatsApp</label><div className="modal-actions"><button type="submit" className="users-primary-button" disabled={saving}>{saving ? "Guardando..." : editingClient ? "Guardar cambios" : "Crear cliente"}</button><button type="button" className="modal-cancel" onClick={closeClientModal} disabled={saving}>Cancelar</button></div></form></div>}
      {clienteAEliminar && !apartadosActivosCliente && <div className="modal-overlay" role="presentation"><section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-client-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setClienteAEliminar(null)} aria-label="Cerrar" disabled={saving}>×</button><h2 id="delete-client-title">Eliminar cliente</h2><div className="confirm-message">¿Eliminar a <strong>{clienteAEliminar.nombre}</strong>? Antes se comprobará que no tenga apartados pendientes. Los apartados históricos se conservarán.</div><div className="modal-actions"><button type="button" className="danger-button" onClick={handleDeleteClient} disabled={saving}>{saving ? "Revisando apartados..." : "Continuar"}</button><button type="button" className="modal-cancel" onClick={() => setClienteAEliminar(null)} disabled={saving}>Cancelar</button></div></section></div>}
      {clienteAEliminar && apartadosActivosCliente && <div className="modal-overlay" role="presentation"><section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="active-reservations-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => { setClienteAEliminar(null); setApartadosActivosCliente(null); setErrorApartado(""); }} aria-label="Cerrar" disabled={saving}>×</button><h2 id="active-reservations-title">Apartados de {clienteAEliminar.nombre}</h2><div className="confirm-message">{apartadosActivosCliente.length ? <>Tiene {apartadosActivosCliente.length} {apartadosActivosCliente.length === 1 ? "apartado activo" : "apartados activos"}. Puedes eliminarlos aquí; cada acción restaura las unidades al inventario.</> : "Ya no quedan apartados activos. Puedes eliminar al cliente."}</div>{errorApartado && <div className="dashboard-alert" role="alert">{errorApartado}</div>}<ul className="client-active-reservations">{apartadosActivosCliente.map((reservation) => <li key={reservation.id}><div className="client-active-reservation-info"><strong>{reservation.codigoProducto || reservation.idProducto}</strong><span>{reservation.producto || "Producto"} · {reservation.cantidad} {reservation.cantidad === 1 ? "unidad" : "unidades"} · {money.format(Number(reservation.precioUnitario || 0))} c/u · Subtotal {money.format(Number(reservation.cantidad || 0) * Number(reservation.precioUnitario || 0))}</span><small>ID de Venta: {reservation.idVenta}</small></div><button type="button" className="table-action danger" onClick={() => handleUnassignClientReservation(reservation)} disabled={saving}>{saving ? "Eliminando..." : "Eliminar apartado"}</button></li>)}</ul>{apartadosActivosCliente.length > 0 && <div className="client-reservations-total"><span>Total de apartados</span><strong>{money.format(apartadosActivosCliente.reduce((total, reservation) => total + Number(reservation.cantidad || 0) * Number(reservation.precioUnitario || 0), 0))}</strong></div>}<div className="modal-actions">{!apartadosActivosCliente.length && <button type="button" className="danger-button" onClick={handleDeleteClient} disabled={saving}>{saving ? "Verificando..." : "Eliminar cliente"}</button>}<button type="button" className="modal-cancel" onClick={() => { setClienteAEliminar(null); setApartadosActivosCliente(null); setErrorApartado(""); }} disabled={saving}>{apartadosActivosCliente.length ? "Conservar cliente" : "Cancelar"}</button></div></section></div>}
      {toast && <div className="success-toast" role="status">{toast}</div>}
      {toastError && <div className="success-toast error-toast" role="alert">{toastError}</div>}
    </div>
  );
}