import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, where, writeBatch } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, functions } from "../firebase";
import logo from "../public/logo-optimized.png";
import AppNavigation from "../components/AppNavigation";
import { loadReceiptPaymentSettings } from "../utils/receiptPaymentSettings";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const RESERVATIONS_PER_PAGE = 4;
const salesRole = (role) => ["admin", "administrador", "vendedor"].includes(String(role || "").trim().toLowerCase());

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value)) : "";
}

function toRecord(snapshot) {
  return {
    id: snapshot.id,
    ...Object.fromEntries(Object.entries(snapshot.data()).map(([key, value]) => [
      key,
      value && typeof value.toMillis === "function" ? value.toMillis() : value,
    ])),
  };
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function Apartados() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [expandedClients, setExpandedClients] = useState({});
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [reservations, setReservations] = useState([]);
  const [clientFilter, setClientFilter] = useState("");
  const [paymentView, setPaymentView] = useState("PENDIENTES");
  const [reservationPage, setReservationPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reservationToEdit, setReservationToEdit] = useState(null);
  const [reservationToDelete, setReservationToDelete] = useState(null);
  const [clientToSettle, setClientToSettle] = useState(null);
  const [receiptActionId, setReceiptActionId] = useState("");
  const [editedQuantity, setEditedQuantity] = useState("");
  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSessions() {
      setLoading(true);
      setError("");
      try {
        const profileSnapshot = await getDoc(doc(db, "usuarios", currentUser.uid));
        const userProfile = profileSnapshot.exists() ? profileSnapshot.data() : null;
        if (mounted) setProfile(userProfile);
        if (!salesRole(userProfile?.rol) || userProfile?.activo !== true) {
          if (mounted) setError("Esta página está disponible para usuarios Administrador y Vendedor activos.");
          return;
        }

        const sessionsSnapshot = await getDocs(query(collection(db, "sesionesVenta"), orderBy("fechaInicio", "desc")));
        if (!mounted) return;
        const sessionRecords = sessionsSnapshot.docs.map(toRecord);
        setSessions(sessionRecords);
        setSelectedSessionId(sessionRecords[0]?.id || "");
      } catch (loadError) {
        console.error(loadError);
        if (mounted) setError("No se pudieron cargar los IDs de Venta. Verifica las reglas de Firestore y tu conexión.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (currentUser) loadSessions();
    return () => { mounted = false; };
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;

    async function loadReservations() {
      if (!selectedSessionId) {
        setReservations([]);
        setLoadingReservations(false);
        return;
      }
      setLoadingReservations(true);
      try {
        const snapshot = await getDocs(query(
          collection(db, "apartados"),
          where("idVenta", "==", selectedSessionId),
        ));
        if (mounted) {
          setReservations(snapshot.docs.map(toRecord)
            .filter((reservation) => ["APARTADO", "PAGADO"].includes(reservation.estatus))
            .sort((left, right) => Number(right.fechaApartado || 0) - Number(left.fechaApartado || 0)));
        }
      } catch (loadError) {
        console.error(loadError);
        if (mounted) {
          setReservations([]);
          setError("No se pudieron cargar los apartados de este ID. Verifica las reglas de Firestore.");
        }
      } finally {
        if (mounted) setLoadingReservations(false);
      }
    }

    if (currentUser) loadReservations();
    return () => { mounted = false; };
  }, [currentUser, selectedSessionId]);

  const clientGroups = useMemo(() => {
    const groups = new Map();
    for (const reservation of reservations) {
      const clientName = String(reservation.nombreCliente || "Cliente sin nombre").trim();
      const clientKey = String(reservation.idCliente || `legacy:${normalize(clientName)}`);
      if (!groups.has(clientKey)) {
        groups.set(clientKey, { id: clientKey, clienteId: reservation.idCliente || "", nombre: clientName, reservations: [] });
      }
      groups.get(clientKey).reservations.push(reservation);
    }

    return [...groups.values()].map((group) => {
      const pending = group.reservations.filter((reservation) => reservation.estatus === "APARTADO");
      const paid = group.reservations.filter((reservation) => reservation.estatus === "PAGADO");
      return {
        ...group,
        pending,
        paid,
        pendingUnits: pending.reduce((total, reservation) => total + Number(reservation.cantidad || 0), 0),
        paidUnits: paid.reduce((total, reservation) => total + Number(reservation.cantidad || 0), 0),
        pendingTotal: pending.reduce((total, reservation) => total + Number(reservation.cantidad || 0) * Number(reservation.precioUnitario || 0), 0),
        paidTotal: paid.reduce((total, reservation) => total + Number(reservation.cantidad || 0) * Number(reservation.precioUnitario || 0), 0),
      };
    }).sort((left, right) => left.nombre.localeCompare(right.nombre, "es-MX", { sensitivity: "base" }));
  }, [reservations]);

  const clientFilterOptions = clientGroups.filter((group) => paymentView === "PAGADOS"
    ? group.paid.length > 0
    : group.pending.length > 0);
  const filteredClients = useMemo(() => {
    return clientGroups
      .map((group) => ({
        ...group,
        visibleReservations: paymentView === "PAGADOS" ? group.paid : group.pending,
      }))
      .filter((group) => group.visibleReservations.length > 0
        && (!clientFilter || group.id === clientFilter));
  }, [clientGroups, clientFilter, paymentView]);
  const totalReservationPages = Math.max(1, Math.ceil(filteredClients.length / RESERVATIONS_PER_PAGE));
  const currentReservationPage = Math.min(reservationPage, totalReservationPages);
  const visibleClients = filteredClients.slice(
    (currentReservationPage - 1) * RESERVATIONS_PER_PAGE,
    currentReservationPage * RESERVATIONS_PER_PAGE,
  );
  const pendingClients = clientGroups.filter((group) => group.pending.length > 0).length;
  const pendingReservationCount = clientGroups.reduce((total, group) => total + group.pending.length, 0);
  const paidReservationCount = clientGroups.reduce((total, group) => total + group.paid.length, 0);
  const pendingAmount = clientGroups.reduce((total, group) => total + group.pendingTotal, 0);
  const paidAmount = clientGroups.reduce((total, group) => total + group.paidTotal, 0);
  const isAdmin = ["admin", "administrador"].includes(String(profile?.rol || "").trim().toLowerCase());
  const canManageReservation = (reservation) => {
    if (reservation.estatus !== "APARTADO") return false;
    const reservationSession = sessions.find((item) => item.id === reservation.idVenta);
    if (reservationSession?.estatus === "CERRADA") return isAdmin;
    return salesRole(profile?.rol) && profile?.activo === true;
  };

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), type === "error" ? 5000 : 3500);
  }

  function getClientReceipt(group, paymentSettings) {
    const selectedSession = sessions.find((session) => session.id === selectedSessionId);
    return {
      clientName: group.nombre,
      sessionId: selectedSessionId,
      purchaseDate: selectedSession?.fechaInicio,
      status: paymentView,
      items: group.visibleReservations,
      paymentSettings,
    };
  }

  async function printClientReceipt(group) {
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      showToast("Permite ventanas emergentes para imprimir el recibo.", "error");
      return;
    }

    setReceiptActionId(group.id);
    try {
      const paymentSettings = await loadReceiptPaymentSettings();
      const { printPurchaseReceipt } = await import("../utils/downloadPurchaseReceipt.js");
      await printPurchaseReceipt(getClientReceipt(group, paymentSettings), printWindow);
    } catch (printError) {
      console.error("No se pudo preparar el recibo para imprimir:", printError);
      printWindow.close();
      showToast("No se pudo abrir el recibo para imprimir. Inténtalo de nuevo.", "error");
    } finally {
      setReceiptActionId("");
    }
  }

  async function downloadClientReceipt(group) {
    setReceiptActionId(group.id);
    try {
      const paymentSettings = await loadReceiptPaymentSettings();
      const { downloadPurchaseReceipt } = await import("../utils/downloadPurchaseReceipt.js");
      await downloadPurchaseReceipt(getClientReceipt(group, paymentSettings));
      showToast("Recibo PDF descargado.");
    } catch (downloadError) {
      console.error("No se pudo generar el recibo PDF:", downloadError);
      showToast("No se pudo descargar el recibo. Inténtalo de nuevo.", "error");
    } finally {
      setReceiptActionId("");
    }
  }

  async function sendClientReceiptWhatsapp(group) {
    setReceiptActionId(group.id);
    try {
      const sendWhatsappReceipt = httpsCallable(functions, "sendWhatsappReceipt");
      const result = await sendWhatsappReceipt({
        clientId: group.clienteId,
        sessionId: selectedSessionId,
        paymentView,
      });
      if (!result.data?.accepted) throw new Error("WhatsApp no confirmó la solicitud.");
      showToast("WhatsApp aceptó el recibo. La entrega puede tardar.");
    } catch (sendError) {
      console.error("No se pudo enviar el recibo por WhatsApp:", sendError);
      showToast(sendError?.message || "No se pudo enviar el recibo por WhatsApp.", "error");
    } finally {
      setReceiptActionId("");
    }
  }

  function openReservationEdit(reservation) {
    setReservationToEdit(reservation);
    setEditedQuantity(String(reservation.cantidad));
  }

  async function updateReservationQuantity(event) {
    event.preventDefault();
    if (!reservationToEdit || !canManageReservation(reservationToEdit)) return;

    const newQuantity = Number(editedQuantity);
    if (!Number.isSafeInteger(newQuantity) || newQuantity < 1) {
      showToast("La cantidad debe ser un entero mayor que cero.", "error");
      return;
    }
    if (newQuantity === Number(reservationToEdit.cantidad)) {
      setReservationToEdit(null);
      return;
    }

    setSaving(true);
    try {
      const reservationRef = doc(db, "apartados", reservationToEdit.id);
      const productRef = doc(db, "productos", reservationToEdit.idProducto);
      const sessionRef = doc(db, "sesionesVenta", reservationToEdit.idVenta);
      const updated = await runTransaction(db, async (transaction) => {
        const [reservationSnapshot, productSnapshot, sessionSnapshot] = await Promise.all([
          transaction.get(reservationRef),
          transaction.get(productRef),
          transaction.get(sessionRef),
        ]);
        if (!reservationSnapshot.exists() || !productSnapshot.exists() || !sessionSnapshot.exists()) {
          throw new Error("No se encontró el apartado, producto o ID de Venta.");
        }
        const reservation = reservationSnapshot.data();
        const product = productSnapshot.data();
        const session = sessionSnapshot.data();
        const canEditOpenSession = session.estatus === "ABIERTA"
          && salesRole(profile?.rol)
          && profile?.activo === true;
        const canEditClosedSession = session.estatus === "CERRADA" && isAdmin;
        if (!canEditOpenSession && !canEditClosedSession) {
          throw new Error("Este ID ya no puede modificarse con tu usuario.");
        }
        if (reservation.idVenta !== reservationToEdit.idVenta || reservation.estatus !== "APARTADO") {
          throw new Error("Solo se pueden editar apartados vigentes.");
        }
        if (String(product.estatus || "").toUpperCase() === "VENDIDO") {
          throw new Error("El producto ya fue vendido; no es seguro modificar su inventario desde este apartado.");
        }

        const oldQuantity = Number(reservation.cantidad);
        const stock = Number(product.cantidad ?? 0);
        const updatedStock = stock - (newQuantity - oldQuantity);
        if (!Number.isSafeInteger(oldQuantity) || oldQuantity < 1
          || !Number.isSafeInteger(updatedStock) || updatedStock < 0) {
          throw new Error("No hay suficientes unidades para esa cantidad.");
        }

        transaction.update(reservationRef, { cantidad: newQuantity });
        transaction.update(productRef, {
          cantidad: updatedStock,
          precioVenta: reservation.precioUnitario,
          estatus: updatedStock === 0 ? "APARTADO" : "DISPONIBLE",
          ...(canEditOpenSession ? { ultimaAsignacionId: reservationRef.id } : {}),
        });
        if (canEditOpenSession) {
          if (!Number.isSafeInteger(Number(session.apartadosActivos))) {
            throw new Error("El contador de esta sesión debe sincronizarse antes de editar.");
          }
          transaction.update(sessionRef, {
            apartadosActivos: Number(session.apartadosActivos),
            ultimoApartadoId: reservationRef.id,
          });
        }
        return { id: reservationRef.id, cantidad: newQuantity };
      });

      setReservations((current) => current.map((item) => item.id === updated.id
        ? { ...item, cantidad: updated.cantidad }
        : item));
      setReservationToEdit(null);
      showToast("Cantidad actualizada; el inventario quedó ajustado.");
    } catch (updateError) {
      console.error(updateError);
      showToast(updateError?.message || "No se pudo actualizar el apartado.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReservation() {
    if (!reservationToDelete || !canManageReservation(reservationToDelete)) return;

    setSaving(true);
    try {
      const reservationRef = doc(db, "apartados", reservationToDelete.id);
      const productRef = doc(db, "productos", reservationToDelete.idProducto);
      const sessionRef = doc(db, "sesionesVenta", reservationToDelete.idVenta);
      const productReservationsSnapshot = await getDocs(query(
        collection(db, "apartados"),
        where("idProducto", "==", reservationToDelete.idProducto),
      ));
      const fallbackCandidates = productReservationsSnapshot.docs
        .map(toRecord)
        .filter((item) => item.id !== reservationToDelete.id && item.estatus === "APARTADO")
        .sort((left, right) => Number(right.fechaApartado || 0) - Number(left.fechaApartado || 0));
      const fallbackRef = fallbackCandidates[0] ? doc(db, "apartados", fallbackCandidates[0].id) : null;

      const deleted = await runTransaction(db, async (transaction) => {
        const [reservationSnapshot, productSnapshot, sessionSnapshot] = await Promise.all([
          transaction.get(reservationRef),
          transaction.get(productRef),
          transaction.get(sessionRef),
        ]);
        if (!reservationSnapshot.exists() || !productSnapshot.exists() || !sessionSnapshot.exists()) {
          throw new Error("No se encontró el apartado, producto o ID de Venta.");
        }
        const reservation = reservationSnapshot.data();
        const product = productSnapshot.data();
        const session = sessionSnapshot.data();
        const canDeleteOpenSession = session.estatus === "ABIERTA"
          && salesRole(profile?.rol)
          && profile?.activo === true;
        const canDeleteClosedSession = session.estatus === "CERRADA" && isAdmin;
        if (!canDeleteOpenSession && !canDeleteClosedSession) {
          throw new Error("Este ID ya no puede modificarse con tu usuario.");
        }
        if (reservation.idVenta !== reservationToDelete.idVenta || reservation.estatus !== "APARTADO") {
          throw new Error("Solo se pueden eliminar apartados vigentes.");
        }
        if (!Number.isSafeInteger(Number(session.apartadosActivos)) || Number(session.apartadosActivos) < 1) {
          throw new Error("El contador del ID no permite eliminar este apartado. Pide a un administrador revisar la sesión.");
        }
        if (String(product.estatus || "").toUpperCase() === "VENDIDO") {
          throw new Error("El producto ya fue vendido; no se puede devolver al inventario desde este apartado.");
        }

        let nextAssignmentId = String(product.ultimaAsignacionId || "");
        if (canDeleteOpenSession) {
          nextAssignmentId = reservationRef.id;
        } else if (nextAssignmentId === reservationRef.id) {
          if (fallbackRef) {
            const fallbackSnapshot = await transaction.get(fallbackRef);
            if (!fallbackSnapshot.exists()
              || fallbackSnapshot.data().estatus !== "APARTADO"
              || fallbackSnapshot.data().idProducto !== reservation.idProducto) {
              throw new Error("Cambió otra asignación del producto. Actualiza e inténtalo de nuevo.");
            }
            nextAssignmentId = fallbackSnapshot.id;
          } else {
            nextAssignmentId = "";
          }
        }

        const restoredStock = Number(product.cantidad ?? 0) + Number(reservation.cantidad);
        if (!Number.isSafeInteger(restoredStock) || restoredStock < 1) {
          throw new Error("No se pudo calcular la existencia que debe restaurarse.");
        }
        transaction.delete(reservationRef);
        transaction.update(sessionRef, {
          apartadosActivos: Number(session.apartadosActivos) - 1,
          ultimoApartadoId: reservationRef.id,
        });
        transaction.update(productRef, {
          cantidad: restoredStock,
          estatus: "DISPONIBLE",
          ultimaAsignacionId: nextAssignmentId,
        });
        return { id: reservationRef.id, idProducto: reservation.idProducto, idVenta: reservation.idVenta };
      });

      setReservations((current) => current.filter((item) => item.id !== deleted.id));
      setSessions((current) => current.map((item) => item.id === deleted.idVenta
        ? { ...item, apartadosActivos: Math.max(0, Number(item.apartadosActivos || 0) - 1) }
        : item));
      setReservationToDelete(null);
      showToast("Apartado eliminado; las unidades volvieron al inventario.");
    } catch (deleteError) {
      console.error(deleteError);
      showToast(deleteError?.message || "No se pudo eliminar el apartado.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function liquidateClientAccount() {
    if (!clientToSettle?.clienteId || !clientToSettle.pending.length) return;
    if (clientToSettle.pending.length > 500) {
      showToast("Esta cuenta tiene demasiados apartados para marcarlos en una sola operación.", "error");
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      for (const reservation of clientToSettle.pending) {
        batch.update(doc(db, "apartados", reservation.id), { estatus: "PAGADO" });
      }
      await batch.commit();
      setReservations((current) => current.map((reservation) => reservation.idCliente === clientToSettle.clienteId
        && reservation.idVenta === selectedSessionId
        && reservation.estatus === "APARTADO"
        ? { ...reservation, estatus: "PAGADO" }
        : reservation));
      setClientToSettle(null);
      setPaymentView("PAGADOS");
      showToast(`${clientToSettle.pending.length} apartados marcados como pagados.`);
    } catch (paymentError) {
      console.error(paymentError);
      showToast(paymentError?.message || "No se pudieron marcar los apartados como pagados.", "error");
    } finally {
      setSaving(false);
    }
  }

  const name = profile?.nombre || currentUser?.displayName || "Usuario";
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <>
    <div className="app-shell sales-page">
      <AppNavigation activePage="ventas" menuOpen={menuOpen} onClose={setMenuOpen} showUsers={salesRole(profile?.rol) && ["admin", "administrador"].includes(String(profile?.rol || "").toLowerCase())} showSales={salesRole(profile?.rol)} />
      <main className="dashboard-main" id="apartados">
        <header className="topbar">
          <div className="topbar-brand"><button className="mobile-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button><img src={logo} alt="La Vendimia" /></div>
          <div className="topbar-actions"><button className="avatar profile-avatar-trigger" onClick={() => setProfileOpen((open) => !open)} aria-label="Abrir perfil" aria-expanded={profileOpen}>{initials}</button></div>
        </header>
        {profileOpen && <section className="profile-popover" aria-label="Menú de perfil"><div className="profile-popover-head"><span className="avatar profile-popover-avatar">{initials}</span><strong>{name}</strong><span>{profile?.rol || "Usuario"}</span><small>{profile?.email || currentUser?.email}</small></div><div className="profile-popover-bottom"><button onClick={handleLogout}>↪ <span>Cerrar sesión</span></button></div></section>}

        <section className="sales-heading"><div><p>HISTORIAL</p><h1>Ventas</h1></div><div className="sales-session-status"><span />{sessions.length} {sessions.length === 1 ? "ID registrado" : "IDs registrados"}</div></section>
        {error && <div className="dashboard-alert" role="alert">{error}</div>}
        {loading ? <div className="sales-loading">Cargando IDs de Venta...</div> : !salesRole(profile?.rol) || profile?.activo !== true ? (
          <section className="sales-empty-state"><h2>Acceso no disponible</h2><p>Esta página está habilitada para usuarios Administrador y Vendedor activos.</p></section>
        ) : sessions.length === 0 ? (
          <section className="sales-empty-state"><h2>Aún no hay IDs de Venta</h2><p>Al cerrar un ID desde la página Venta, quedará disponible aquí con sus apartados.</p><button className="users-primary-button history-go-to-sale" onClick={() => navigate("/venta")}>Ir a Venta</button></section>
        ) : <>
          <section className="history-session-toolbar"><label htmlFor="history-session-select">ID de Venta</label><select id="history-session-select" value={selectedSessionId} onChange={(event) => { setSelectedSessionId(event.target.value); setClientFilter(""); setPaymentView("PENDIENTES"); setReservationPage(1); setReservationToEdit(null); setReservationToDelete(null); setClientToSettle(null); }}>{sessions.map((item) => <option key={item.id} value={item.id}>{formatDate(item.fechaInicio)}</option>)}</select></section>

          <section className="history-summary" aria-label="Resumen de cuentas de clientes">
            <article><span>Clientes con saldo</span><strong>{pendingClients}</strong></article>
            <article><span>Total pendiente por cobrar</span><strong>{money.format(pendingAmount)}</strong></article>
            <article><span>Total pagado</span><strong>{money.format(paidAmount)}</strong></article>
          </section>

          <section className="history-reservations">
            <div className="history-list-heading"><div><h2>Cuentas del ID seleccionado</h2><p>Elige un cliente para revisar sus pendientes y pagos en este ID.</p></div><div className="history-filters"><label className="history-client-filter"><span>Cliente</span><select aria-label="Filtrar por nombre del cliente" value={clientFilter} onChange={(event) => { setClientFilter(event.target.value); setReservationPage(1); }}><option value="">Todos los clientes</option>{clientFilterOptions.map((group) => <option key={group.id} value={group.id}>{group.nombre}</option>)}</select></label></div></div>
            <div className="history-status-tabs" role="tablist" aria-label="Estado de las cuentas"><button type="button" role="tab" aria-selected={paymentView === "PENDIENTES"} className={paymentView === "PENDIENTES" ? "active" : ""} onClick={() => { setPaymentView("PENDIENTES"); setClientFilter(""); setReservationPage(1); }}>Pendientes <span>{pendingReservationCount}</span></button><button type="button" role="tab" aria-selected={paymentView === "PAGADOS"} className={paymentView === "PAGADOS" ? "active" : ""} onClick={() => { setPaymentView("PAGADOS"); setClientFilter(""); setReservationPage(1); }}>Pagados <span>{paidReservationCount}</span></button></div>
            {loadingReservations ? (
              <div className="sales-loading">Cargando cuentas...</div>
            ) : filteredClients.length ? (
              <div className="history-client-list">
                {visibleClients.map((group) => {
                  const expanded = Boolean(expandedClients[group.id]);
                  const detailsId = `client-account-${encodeURIComponent(group.id)}`;
                  return (
                    <section className="history-client-group" key={group.id}>
                      <div className="history-client-heading">
                        <div>
                          <h3>{group.nombre}</h3>
                          <span>{paymentView === "PAGADOS"
                            ? `${group.paid.length} apartados pagados · ${group.paidUnits} unidades`
                            : `${group.pending.length} apartados · ${group.pendingUnits} unidades pendientes · ${group.paid.length} pagados`}</span>
                          <button
                            type="button"
                            className="history-client-toggle"
                            aria-expanded={expanded}
                            aria-controls={detailsId}
                            onClick={() => setExpandedClients((current) => ({ ...current, [group.id]: !current[group.id] }))}
                          >
                            {expanded ? "Ocultar productos" : `Ver productos (${group.visibleReservations.length})`}
                          </button>
                        </div>
                        <div className="history-client-totals">
                          {paymentView === "PENDIENTES" && <div><small>Pendiente</small><strong>{money.format(group.pendingTotal)}</strong></div>}
                          {paymentView === "PAGADOS" && <div><small>Pagado</small><strong>{money.format(group.paidTotal)}</strong></div>}
                          {group.visibleReservations.length > 0 && <button type="button" className="history-print-button history-icon-button" aria-label={`Imprimir recibo de ${group.nombre}`} title={`Imprimir recibo de ${group.nombre}`} disabled={receiptActionId === group.id} onClick={() => printClientReceipt(group)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7zM18 11h.01" /></svg>
                          </button>}
                          {group.visibleReservations.length > 0 && <button type="button" className="history-print-button history-icon-button" aria-label={`Descargar recibo de ${group.nombre}`} title={`Descargar recibo de ${group.nombre}`} disabled={receiptActionId === group.id} onClick={() => downloadClientReceipt(group)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg>
                          </button>}
                          {group.visibleReservations.length > 0 && <button type="button" className="history-print-button history-icon-button" aria-label={`Enviar recibo por WhatsApp a ${group.nombre}`} title={`Enviar recibo por WhatsApp a ${group.nombre}`} disabled={receiptActionId === group.id} onClick={() => sendClientReceiptWhatsapp(group)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3 20l1-4.7A8.5 8.5 0 1 1 20.5 11.7Z" /><path d="M8.2 7.5c-.3.2-.7.8-.7 1.7s.7 1.9.8 2.1c.1.2 1.4 2.3 3.4 3.1 1.7.7 2 .5 2.4.5.4 0 1.3-.5 1.5-1 .2-.5.2-.9.1-1-.1-.1-.3-.2-.6-.3l-1.4-.7c-.2-.1-.4-.1-.5.1l-.7.8c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.5 7.5 0 0 1-1.4-1.8c-.1-.2 0-.4.1-.5l.5-.6c.1-.2.2-.3.2-.5l-.6-1.5c-.1-.3-.3-.4-.5-.4h-.5Z" /></svg>
                          </button>}
                          {paymentView === "PENDIENTES" && group.pending.length > 0 && <button type="button" className="users-primary-button" disabled={saving || !group.clienteId} onClick={() => setClientToSettle(group)}>Liquidar cuenta</button>}
                        </div>
                      </div>
                      <div id={detailsId} className="history-client-lines" hidden={!expanded}>
                        <div className="history-client-products-tab"><span>{paymentView === "PENDIENTES" ? "Apartados pendientes" : "Apartados pagados"}</span><b>{group.visibleReservations.length}</b></div>
                        {group.visibleReservations.map((reservation) => (
                          <article className="history-client-line" key={reservation.id}>
                            <div className="history-client-line-main">
                              <div>
                                <strong>{reservation.codigoProducto || reservation.idProducto}</strong>
                                <span>{reservation.producto || "Producto"} · {reservation.cantidad} {reservation.cantidad === 1 ? "unidad" : "unidades"}</span>
                              </div>
                              <strong>{money.format(Number(reservation.cantidad || 0) * Number(reservation.precioUnitario || 0))}</strong>
                            </div>
                            <div className="history-client-line-meta">
                              <span>{money.format(Number(reservation.precioUnitario || 0))} c/u</span>
                              <div className="history-client-line-controls">
                                {reservation.estatus === "PAGADO" && <span className="client-payment-status is-paid">Pagado</span>}
                                {canManageReservation(reservation) && <div className="history-reservation-actions"><button type="button" className="table-action" disabled={saving} onClick={() => openReservationEdit(reservation)}>Editar</button><button type="button" className="table-action danger" disabled={saving} onClick={() => setReservationToDelete(reservation)}>Eliminar</button></div>}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : <div className="sales-empty-state compact">{reservations.length ? "No hay cuentas que coincidan con el filtro." : "No hay apartados ni pagos registrados."}</div>}
            {totalReservationPages > 1 && <div className="sales-reservation-pagination"><span>Mostrando clientes {(currentReservationPage - 1) * RESERVATIONS_PER_PAGE + 1}-{Math.min(currentReservationPage * RESERVATIONS_PER_PAGE, filteredClients.length)} de {filteredClients.length}</span><div className="pagination"><button type="button" aria-label="Clientes anteriores" disabled={currentReservationPage === 1} onClick={() => setReservationPage((page) => Math.max(1, page - 1))}>‹</button><button type="button" className="current" aria-current="page">{currentReservationPage}</button><button type="button" aria-label="Más clientes" disabled={currentReservationPage === totalReservationPages} onClick={() => setReservationPage((page) => Math.min(totalReservationPages, page + 1))}>›</button></div></div>}
          </section>
        </>}
      </main>
      {reservationToEdit && <div className="modal-overlay" role="presentation"><form className="user-modal" role="dialog" aria-modal="true" aria-labelledby="history-edit-title" onClick={(event) => event.stopPropagation()} onSubmit={updateReservationQuantity}><button type="button" className="modal-close" onClick={() => setReservationToEdit(null)} aria-label="Cerrar" disabled={saving}>×</button><h2 id="history-edit-title">Editar apartado</h2><p className="modal-subtitle">{reservationToEdit.codigoProducto} · {reservationToEdit.producto} · {reservationToEdit.nombreCliente}</p><div className="confirm-message">El cambio ajustará el inventario y conservará el precio. Los IDs cerrados solo los puede corregir un administrador.</div><label htmlFor="history-edit-quantity">Cantidad<input id="history-edit-quantity" type="number" inputMode="numeric" min="1" step="1" required autoFocus value={editedQuantity} onChange={(event) => setEditedQuantity(event.target.value)} /></label><div className="modal-actions"><button type="submit" className="users-primary-button" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button><button type="button" className="modal-cancel" onClick={() => setReservationToEdit(null)} disabled={saving}>Cancelar</button></div></form></div>}
      {reservationToDelete && <div className="modal-overlay" role="presentation"><section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="history-delete-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setReservationToDelete(null)} aria-label="Cerrar" disabled={saving}>×</button><h2 id="history-delete-title">Eliminar apartado</h2><div className="confirm-message">Se eliminará <strong>{reservationToDelete.codigoProducto}</strong> de <strong>{reservationToDelete.nombreCliente}</strong> y se devolverán {reservationToDelete.cantidad} {reservationToDelete.cantidad === 1 ? "unidad" : "unidades"} al inventario. Los apartados de IDs cerrados solo los puede corregir un administrador.</div><div className="modal-actions"><button type="button" className="danger-button" onClick={deleteReservation} disabled={saving}>{saving ? "Eliminando..." : "Eliminar apartado"}</button><button type="button" className="modal-cancel" onClick={() => setReservationToDelete(null)} disabled={saving}>Cancelar</button></div></section></div>}
      {clientToSettle && <div className="modal-overlay" role="presentation"><section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="settle-client-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setClientToSettle(null)} aria-label="Cerrar" disabled={saving}>×</button><h2 id="settle-client-title">Liquidar cuenta</h2><div className="confirm-message">Confirma que <strong>{clientToSettle.nombre}</strong> pagó estos {clientToSettle.pending.length} apartados del ID {selectedSessionId}. Solo cambiará el estado; el inventario no se modifica.</div><ul className="client-active-reservations">{clientToSettle.pending.map((reservation) => <li key={reservation.id}><div className="client-active-reservation-info"><strong>{reservation.codigoProducto || reservation.idProducto}</strong><span>{reservation.producto || "Producto"} · {reservation.cantidad} {reservation.cantidad === 1 ? "unidad" : "unidades"} · {money.format(Number(reservation.cantidad || 0) * Number(reservation.precioUnitario || 0))}</span><small>ID de Venta: {reservation.idVenta}</small></div></li>)}</ul><div className="client-reservations-total"><span>Total</span><strong>{money.format(clientToSettle.pendingTotal)}</strong></div><div className="modal-actions"><button type="button" className="users-primary-button" onClick={liquidateClientAccount} disabled={saving || !clientToSettle.clienteId}>{saving ? "Actualizando..." : "Confirmar pago"}</button><button type="button" className="modal-cancel" onClick={() => setClientToSettle(null)} disabled={saving}>Cancelar</button></div></section></div>}
      {toast && <div className={`success-toast${toast.type === "error" ? " error-toast" : ""}`} role={toast.type === "error" ? "alert" : "status"}>{toast.message}</div>}
    </div>
    </>
  );
}