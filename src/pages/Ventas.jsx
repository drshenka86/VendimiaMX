import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import logo from "../public/logo-optimized.png";
import AppNavigation from "../components/AppNavigation";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const RESERVATIONS_PER_PAGE = 4;
const salesRole = (role) => ["admin", "administrador", "vendedor"].includes(String(role || "").trim().toLowerCase());
const normalizeProductKey = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

async function loadWorkspace() {
  const activeRef = doc(db, "configuracionVentas", "sesionActiva");
  const [activeSnapshot, clientsSnapshot] = await Promise.all([
    getDoc(activeRef),
    getDocs(collection(db, "clientes")),
  ]);
  const fromSnapshot = (snapshot) => ({
    id: snapshot.id,
    ...Object.fromEntries(Object.entries(snapshot.data()).map(([key, value]) => [
      key,
      value && typeof value.toMillis === "function" ? value.toMillis() : value,
    ])),
  });
  const activeId = activeSnapshot.exists() ? activeSnapshot.data().idVenta : null;
  if (!activeId) {
    return {
      session: null,
      sessionIsActive: false,
      clients: clientsSnapshot.docs.map(fromSnapshot).sort((left, right) => left.nombre.localeCompare(right.nombre)),
      reservations: [],
    };
  }

  const [sessionSnapshot, reservationsSnapshot] = await Promise.all([
    getDoc(doc(db, "sesionesVenta", activeId)),
    getDocs(query(collection(db, "apartados"), where("idVenta", "==", activeId))),
  ]);
  if (!sessionSnapshot.exists()) {
    return {
      session: null,
      sessionIsActive: false,
      clients: clientsSnapshot.docs.map(fromSnapshot).sort((left, right) => left.nombre.localeCompare(right.nombre)),
      reservations: [],
    };
  }

  const sessionRecord = fromSnapshot(sessionSnapshot);
  const activeReservations = reservationsSnapshot.docs
    .map(fromSnapshot)
    .filter((reservation) => reservation.estatus === "APARTADO");
  const needsCounterMigration = !Number.isSafeInteger(sessionRecord.apartadosActivos);
  if (needsCounterMigration) sessionRecord.apartadosActivos = activeReservations.length;

  return {
    session: { ...sessionRecord, needsCounterMigration },
    sessionIsActive: true,
    clients: clientsSnapshot.docs.map(fromSnapshot).sort((left, right) => left.nombre.localeCompare(right.nombre)),
    reservations: activeReservations
      .sort((left, right) => Number(right.fechaApartado || 0) - Number(left.fechaApartado || 0))
      .slice(0, 100),
  };
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";
}

function getErrorMessage(error) {
  const code = String(error?.code || "").split("/").pop();
  const messages = {
    "permission-denied": "Tu usuario no tiene permiso para operar ventas.",
    "failed-precondition": error?.message || "La sesión o el inventario cambió. Actualiza e inténtalo de nuevo.",
    "unavailable": "No hay conexión con Firebase. Revisa tu conexión e inténtalo de nuevo.",
    "not-found": error?.message || "No se encontró el registro seleccionado.",
    "invalid-argument": error?.message || "Revisa los datos capturados.",
  };
  if (code === "permission-denied") {
    return "Firebase rechazó la operación (permission-denied). Verifica que las reglas de Firestore estén actualizadas y que el rol de tu perfil sea Administrador o Vendedor activo.";
  }
  return messages[code] || `No se pudo completar la operación (${code || "error desconocido"}). ${error?.message || ""}`.trim();
}

export default function Ventas() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [session, setSession] = useState(null);
  const [sessionIsActive, setSessionIsActive] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [reservationQuery, setReservationQuery] = useState("");
  const [reservationPage, setReservationPage] = useState(1);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [clientChoice, setClientChoice] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientCountryCode, setNewClientCountryCode] = useState("+52");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientWhatsappConsent, setNewClientWhatsappConsent] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reservationToUnassign, setReservationToUnassign] = useState(null);
  const [reservationToEdit, setReservationToEdit] = useState(null);
  const [editedReservationQuantity, setEditedReservationQuantity] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      setLoading(true);
      setError("");
      try {
        const profileSnapshot = await getDoc(doc(db, "usuarios", currentUser.uid));
        if (!mounted) return;

        const userProfile = profileSnapshot.exists() ? profileSnapshot.data() : null;
        setProfile(userProfile);
        if (!salesRole(userProfile?.rol) || userProfile?.activo !== true) {
          setError("Tu usuario no tiene permiso para operar ventas.");
          return;
        }

        const [productsSnapshot, initialWorkspace] = await Promise.all([
          getDocs(collection(db, "productos")),
          loadWorkspace(),
        ]);
        if (!mounted) return;
        setProducts(productsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        let workspace = initialWorkspace;
        const role = String(userProfile?.rol || "").trim().toLowerCase();
        if (workspace.session?.needsCounterMigration && ["admin", "administrador"].includes(role)) {
          const sessionRef = doc(db, "sesionesVenta", workspace.session.id);
          const activeRef = doc(db, "configuracionVentas", "sesionActiva");
          await runTransaction(db, async (transaction) => {
            const [sessionSnapshot, activeSnapshot] = await Promise.all([
              transaction.get(sessionRef),
              transaction.get(activeRef),
            ]);
            if (sessionSnapshot.exists()
              && activeSnapshot.data()?.idVenta === workspace.session.id
              && sessionSnapshot.data().estatus === "ABIERTA"
              && !Number.isSafeInteger(sessionSnapshot.data().apartadosActivos)) {
              transaction.update(sessionRef, {
                apartadosActivos: workspace.session.apartadosActivos,
                ultimoApartadoId: null,
              });
            }
          });
          workspace = await loadWorkspace();
        }
        if (!mounted) return;
        setClients(workspace.clients || []);
        setSession(workspace.session || null);
        setSessionIsActive(Boolean(workspace.sessionIsActive));
        setReservations(workspace.reservations || []);
        if (workspace.session?.needsCounterMigration) {
          setError("Este ID antiguo necesita que un administrador abra esta página para sincronizar el contador de apartados antes de operar.");
        }
      } catch (loadError) {
        console.error(loadError);
        if (mounted) setError(getErrorMessage(loadError));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (currentUser) initialize();
    return () => { mounted = false; };
  }, [currentUser]);

  const availableProducts = useMemo(() => products.filter((product) => {
    const count = Number(product.cantidad ?? 1);
    const status = String(product.estatus || "").toUpperCase();
    return count > 0 && !["APARTADO", "VENDIDO", "CANCELADO"].includes(status);
  }), [products]);

  const matchingProducts = useMemo(() => {
    const query = normalizeProductKey(productQuery);
    if (!query || selectedProduct) return [];
    return availableProducts
      .filter((product) => [product.codigoProducto, product.idProducto, product.id]
        .some((key) => normalizeProductKey(key).includes(query)))
      .slice(0, 8);
  }, [availableProducts, productQuery, selectedProduct]);
  const matchingClients = useMemo(() => {
    const search = clientSearch.trim().toLocaleLowerCase("es-MX");
    return clients.filter((client) => String(client.nombre || "").toLocaleLowerCase("es-MX").includes(search));
  }, [clients, clientSearch]);
  const filteredReservations = useMemo(() => {
    const search = reservationQuery.trim().toLocaleLowerCase("es-MX").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!search) return reservations;
    return reservations.filter((reservation) => `${reservation.nombreCliente} ${reservation.producto} ${reservation.codigoProducto}`
      .toLocaleLowerCase("es-MX")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(search));
  }, [reservations, reservationQuery]);
  const totalReservationPages = Math.max(1, Math.ceil(filteredReservations.length / RESERVATIONS_PER_PAGE));
  const currentReservationPage = Math.min(reservationPage, totalReservationPages);
  const visibleReservations = filteredReservations.slice(
    (currentReservationPage - 1) * RESERVATIONS_PER_PAGE,
    currentReservationPage * RESERVATIONS_PER_PAGE,
  );

  useEffect(() => {
    setReservationPage(1);
  }, [reservationQuery]);

  const name = profile?.nombre || currentUser?.displayName || "Usuario";
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const stock = selectedProduct ? Number(selectedProduct.cantidad ?? 1) : 0;
  const activeReservationCount = Number(session?.apartadosActivos ?? reservations.length);
  const canCloseSession = activeReservationCount > 0;
  const needsCounterMigration = Boolean(session?.needsCounterMigration);
  const calculatedTotal = Number(quantity || 0) * Number(unitPrice || 0);
  const canAssign = sessionIsActive && !needsCounterMigration && selectedProduct && (clientChoice === "new" ? newClientName.trim() : clientChoice) && quantity > 0 && quantity <= stock && Number.isFinite(Number(unitPrice)) && Number(unitPrice) >= 0;

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(null), type === "error" ? 5000 : 3500);
  }

  async function refreshWorkspace() {
    const workspace = await loadWorkspace();
    setClients(workspace.clients || []);
    setSession(workspace.session || null);
    setSessionIsActive(Boolean(workspace.sessionIsActive));
    setReservations(workspace.reservations || []);
  }

  function chooseProduct(product) {
    setSelectedProduct(product);
    setProductQuery(product.codigoProducto || product.id);
    setQuantity(1);
    setUnitPrice(String(Number(product.precioVenta || 0)));
  }

  async function startSession() {
    setSaving(true);
    setError("");
    try {
      const activeRef = doc(db, "configuracionVentas", "sesionActiva");
      const sessionRef = doc(collection(db, "sesionesVenta"));
      await runTransaction(db, async (transaction) => {
        const activeSnapshot = await transaction.get(activeRef);
        if (activeSnapshot.exists()) {
          throw new Error("Ya existe un ID de Venta abierto. Cierra esa sesión antes de iniciar otra.");
        }
        transaction.set(sessionRef, {
          estatus: "ABIERTA",
          apartadosActivos: 0,
          ultimoApartadoId: null,
          fechaInicio: serverTimestamp(),
          fechaCierre: null,
          creadoPor: currentUser.uid,
        });
        transaction.set(activeRef, { idVenta: sessionRef.id });
      });
      await refreshWorkspace();
      showToast("ID de Venta iniciado. Ya puedes registrar apartados.");
    } catch (startError) {
      console.error(startError);
      showToast(getErrorMessage(startError), "error");
      await refreshWorkspace().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function closeSession() {
    if (!session?.id) return;
    setSaving(true);
    setError("");
    try {
      const activeRef = doc(db, "configuracionVentas", "sesionActiva");
      const sessionRef = doc(db, "sesionesVenta", session.id);
      await runTransaction(db, async (transaction) => {
        const [activeSnapshot, sessionSnapshot] = await Promise.all([
          transaction.get(activeRef),
          transaction.get(sessionRef),
        ]);
        if (!sessionSnapshot.exists() || activeSnapshot.data()?.idVenta !== session.id || sessionSnapshot.data().estatus !== "ABIERTA") {
          throw new Error("Este ID de Venta ya no está abierto. Actualiza la pantalla e inténtalo de nuevo.");
        }
        if (!Number.isSafeInteger(sessionSnapshot.data().apartadosActivos)) {
          throw new Error("Este ID fue creado con una versión anterior. Cierra o cancela sus apartados y crea un ID nuevo.");
        }
        const count = sessionSnapshot.data().apartadosActivos;
        if (count === 0) {
          transaction.delete(sessionRef);
        } else {
          transaction.update(sessionRef, {
            estatus: "CERRADA",
            fechaCierre: serverTimestamp(),
            cerradoPor: currentUser.uid,
          });
        }
        transaction.delete(activeRef);
      });
      await refreshWorkspace();
      setSession(null);
      setSessionIsActive(false);
      setReservations([]);
      setReservationQuery("");
      setCloseModalOpen(false);
      showToast(canCloseSession
        ? "ID de Venta cerrado. Sus apartados siguen guardados en el historial."
        : "ID de Venta cancelado porque no tenía apartados.");
      setSelectedProduct(null);
      setProductQuery("");
      setClientChoice("");
      setClientSearch("");
      setClientDropdownOpen(false);
      setNewClientName("");
      setNewClientCountryCode("+52");
      setNewClientPhone("");
      setNewClientWhatsappConsent(false);
      setQuantity(1);
      setUnitPrice("");
    } catch (closeError) {
      console.error(closeError);
      showToast(getErrorMessage(closeError), "error");
    } finally {
      setSaving(false);
    }
  }

  async function reserveProduct(event) {
    event.preventDefault();
    if (!canAssign || !selectedProduct) return;
    if (clientChoice === "new" && newClientWhatsappConsent && !newClientPhone.replace(/\D/g, "")) {
      setError("Agrega el celular del cliente antes de aceptar el envío de recibos por WhatsApp.");
      return;
    }
    if (clientChoice === "new" && !/^\+[1-9]\d{0,2}$/.test(newClientCountryCode)) {
      setError("Ingresa un código de país válido, por ejemplo +52.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const isNewClient = clientChoice === "new";
      const clientRef = isNewClient ? doc(collection(db, "clientes")) : doc(db, "clientes", clientChoice);
      const productRef = doc(db, "productos", selectedProduct.id);
      const sessionRef = doc(db, "sesionesVenta", session.id);
      const activeRef = doc(db, "configuracionVentas", "sesionActiva");
      const unitPriceValue = Number(Number(unitPrice).toFixed(2));
      const selectedProductCode = String(selectedProduct.codigoProducto || selectedProduct.idProducto || selectedProduct.id);
      const sessionReservationsSnapshot = await getDocs(query(
        collection(db, "apartados"),
        where("idVenta", "==", session.id),
      ));
      const matchingReservationCandidate = sessionReservationsSnapshot.docs
        .map((snapshot) => ({ snapshot, data: snapshot.data() }))
        .filter(({ data }) => data.estatus === "APARTADO"
          && data.idCliente === clientRef.id
          && (data.idProducto === selectedProduct.id
            || (data.codigoProducto && normalizeProductKey(data.codigoProducto) === normalizeProductKey(selectedProductCode)))
          && Number(data.precioUnitario) === unitPriceValue)
        .sort((left, right) => Number(right.data.fechaApartado?.toMillis?.() || 0)
          - Number(left.data.fechaApartado?.toMillis?.() || 0))[0]?.snapshot || null;
      const reservationId = `auto_${encodeURIComponent(session.id)}_${encodeURIComponent(clientRef.id)}_${encodeURIComponent(selectedProduct.id)}_${unitPriceValue.toFixed(2)}`;
      const reservationRef = matchingReservationCandidate?.ref || doc(db, "apartados", reservationId);
      const reservation = await runTransaction(db, async (transaction) => {
        const [activeSnapshot, sessionSnapshot, productSnapshot, clientSnapshot, reservationSnapshot] = await Promise.all([
          transaction.get(activeRef),
          transaction.get(sessionRef),
          transaction.get(productRef),
          isNewClient ? Promise.resolve(null) : transaction.get(clientRef),
          transaction.get(reservationRef),
        ]);
        if (activeSnapshot.data()?.idVenta !== session.id || !sessionSnapshot.exists() || sessionSnapshot.data().estatus !== "ABIERTA") {
          throw new Error("El ID de Venta ya no está abierto. Actualiza la pantalla.");
        }
        if (!productSnapshot.exists()) throw new Error("No se encontró el producto seleccionado.");
        if (!isNewClient && !clientSnapshot.exists()) throw new Error("No se encontró el cliente seleccionado.");

        const product = productSnapshot.data();
        const available = Number(product.cantidad ?? 1);
        const status = String(product.estatus || "").trim().toUpperCase();
        if (!Number.isSafeInteger(available) || available < Number(quantity) || ["APARTADO", "VENDIDO", "CANCELADO"].includes(status)) {
          throw new Error("La cantidad disponible cambió. Actualiza la pantalla y vuelve a buscar el producto.");
        }

        const customerName = isNewClient ? newClientName.trim() : String(clientSnapshot.data().nombre || "").trim();
        if (!customerName) throw new Error("El cliente necesita un nombre.");
        const remaining = available - Number(quantity);
        const sessionReservationCount = Number(sessionSnapshot.data().apartadosActivos || 0);
        const productCode = String(product.codigoProducto || product.idProducto || productSnapshot.id);
        const savedReservation = reservationSnapshot.exists() ? reservationSnapshot.data() : null;
        const sameProduct = savedReservation && (savedReservation.idProducto === productSnapshot.id
          || (savedReservation.codigoProducto
            && normalizeProductKey(savedReservation.codigoProducto) === normalizeProductKey(productCode)));
        const matchingReservation = savedReservation
          && savedReservation.estatus === "APARTADO"
          && savedReservation.idVenta === session.id
          && savedReservation.idCliente === clientRef.id
          && sameProduct
          && Number(savedReservation.precioUnitario) === unitPriceValue
          ? reservationSnapshot
          : null;
        if (reservationSnapshot.exists() && !matchingReservation) {
          throw new Error("El apartado cambió mientras se guardaba. Actualiza e inténtalo de nuevo.");
        }
        if (matchingReservation && savedReservation.idProducto !== productSnapshot.id) {
          throw new Error("La clave coincide con otro registro de producto. Corrige el producto duplicado antes de acumular cantidades.");
        }
        const targetReservationRef = matchingReservation?.ref || reservationRef;
        const existingQuantity = matchingReservation ? Number(matchingReservation.data().cantidad) : 0;
        const assignedQuantity = existingQuantity + Number(quantity);
        const values = {
          idVenta: session.id,
          idCliente: clientRef.id,
          nombreCliente: customerName,
          idProducto: productSnapshot.id,
          codigoProducto: productCode,
          producto: String(product.producto || "Producto"),
          cantidad: assignedQuantity,
          precioUnitario: unitPriceValue,
          estatus: "APARTADO",
          fechaApartado: serverTimestamp(),
          creadoPor: currentUser.uid,
        };

        if (isNewClient) {
          const phone = newClientPhone.replace(/\D/g, "").slice(0, 15) || null;
          const acceptsWhatsApp = newClientWhatsappConsent && Boolean(phone);
          transaction.set(clientRef, {
            id: clientRef.id,
            nombre: customerName,
            codigoPais: newClientCountryCode,
            celular: phone,
            aceptaWhatsApp: acceptsWhatsApp,
            whatsappConsentAt: acceptsWhatsApp ? serverTimestamp() : null,
            fecha_alta: serverTimestamp(),
            creadoPor: currentUser.uid,
          });
        }
        if (matchingReservation) {
          transaction.update(targetReservationRef, { cantidad: assignedQuantity });
        } else {
          transaction.set(targetReservationRef, values);
        }
        transaction.update(sessionRef, {
          apartadosActivos: sessionReservationCount + (matchingReservation ? 0 : 1),
          ultimoApartadoId: targetReservationRef.id,
        });
        transaction.update(productRef, {
          cantidad: remaining,
          precioVenta: values.precioUnitario,
          estatus: remaining === 0 ? "APARTADO" : "DISPONIBLE",
          ultimaAsignacionId: targetReservationRef.id,
        });

        return {
          id: targetReservationRef.id,
          ...(matchingReservation ? matchingReservation.data() : values),
          cantidad: assignedQuantity,
          fechaApartado: matchingReservation?.data().fechaApartado?.toMillis?.() || Date.now(),
          idCliente: clientRef.id,
          nombreCliente: customerName,
          cantidadDisponible: remaining,
          acumulado: Boolean(matchingReservation),
        };
      });

      setProducts((current) => current.map((product) => product.id === selectedProduct.id
        ? { ...product, cantidad: reservation.cantidadDisponible, precioVenta: Number(unitPrice), estatus: reservation.cantidadDisponible === 0 ? "APARTADO" : "DISPONIBLE" }
        : product));
      setSession((current) => current ? { ...current, apartadosActivos: Number(current.apartadosActivos || 0) + (reservation.acumulado ? 0 : 1), ultimoApartadoId: reservation.id } : current);
      setClients((current) => reservation.nombreCliente && !current.some((client) => client.id === reservation.idCliente)
        ? [...current, { id: reservation.idCliente, nombre: reservation.nombreCliente }].sort((a, b) => a.nombre.localeCompare(b.nombre))
        : current);
      setReservations((current) => reservation.acumulado
        ? current.map((item) => item.id === reservation.id ? { ...item, cantidad: reservation.cantidad } : item)
        : [{ ...reservation, fechaApartado: Date.now() }, ...current]);
      setSelectedProduct(null);
      setProductQuery("");
      setClientChoice("");
      setClientSearch("");
      setClientDropdownOpen(false);
      setNewClientName("");
      setNewClientCountryCode("+52");
      setNewClientPhone("");
      setNewClientWhatsappConsent(false);
      setQuantity(1);
      setUnitPrice("");
      showToast(reservation.acumulado
        ? `Se agregaron ${quantity} unidades a ${reservation.codigoProducto} para ${reservation.nombreCliente}.`
        : `${reservation.codigoProducto} apartado para ${reservation.nombreCliente}.`);
    } catch (reservationError) {
      console.error(reservationError);
      showToast(getErrorMessage(reservationError), "error");
      try {
        const snapshot = await getDocs(collection(db, "productos"));
        setProducts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch (refreshError) {
        console.error(refreshError);
      }
    } finally {
      setSaving(false);
    }
  }

  async function unassignReservation() {
    if (!reservationToUnassign) return;
    setSaving(true);
    try {
      const reservationRef = doc(db, "apartados", reservationToUnassign.id);
      const productRef = doc(db, "productos", reservationToUnassign.idProducto);
      const sessionRef = doc(db, "sesionesVenta", reservationToUnassign.idVenta);
      const reservation = await runTransaction(db, async (transaction) => {
        const [reservationSnapshot, productSnapshot, sessionSnapshot] = await Promise.all([
          transaction.get(reservationRef),
          transaction.get(productRef),
          transaction.get(sessionRef),
        ]);
        if (!reservationSnapshot.exists() || !productSnapshot.exists() || !sessionSnapshot.exists()) {
          throw new Error("No se encontró el apartado o el producto. Actualiza la pantalla.");
        }
        const savedReservation = reservationSnapshot.data();
        const product = productSnapshot.data();
        const sessionData = sessionSnapshot.data();
        if (savedReservation.estatus !== "APARTADO") {
          throw new Error("Este apartado ya no está activo y no se puede desasignar.");
        }
        if (sessionData.estatus !== "ABIERTA" || Number(sessionData.apartadosActivos || 0) < 1) {
          throw new Error("El ID de Venta ya está cerrado; no se pueden eliminar apartados desde esta pantalla.");
        }
        const restoredQuantity = Number(product.cantidad ?? 0) + Number(savedReservation.cantidad);
        if (!Number.isSafeInteger(restoredQuantity) || restoredQuantity < 1) {
          throw new Error("No se pudo calcular la existencia que debe restaurarse.");
        }
        transaction.delete(reservationRef);
        transaction.update(sessionRef, {
          apartadosActivos: Number(sessionData.apartadosActivos) - 1,
          ultimoApartadoId: reservationRef.id,
        });
        transaction.update(productRef, {
          cantidad: restoredQuantity,
          estatus: "DISPONIBLE",
          ultimaAsignacionId: reservationRef.id,
        });
        return { ...savedReservation, cantidadDisponible: restoredQuantity };
      });

      setProducts((current) => current.map((product) => product.id === reservation.idProducto
        ? { ...product, cantidad: reservation.cantidadDisponible, estatus: "DISPONIBLE", ultimaAsignacionId: reservationToUnassign.id }
        : product));
      setSession((current) => current ? { ...current, apartadosActivos: Math.max(0, Number(current.apartadosActivos || 0) - 1), ultimoApartadoId: reservationToUnassign.id } : current);
      setReservations((current) => current.filter((item) => item.id !== reservationToUnassign.id));
      setReservationToUnassign(null);
      showToast(`${reservation.codigoProducto} se eliminó del ID y volvió al inventario.`);
    } catch (unassignError) {
      console.error(unassignError);
      showToast(getErrorMessage(unassignError), "error");
    } finally {
      setSaving(false);
    }
  }

  function openReservationEdit(reservation) {
    setReservationToEdit(reservation);
    setEditedReservationQuantity(String(reservation.cantidad));
  }

  async function saveReservationEdit(event) {
    event.preventDefault();
    if (!reservationToEdit) return;

    const newQuantity = Number(editedReservationQuantity);
    if (!Number.isSafeInteger(newQuantity) || newQuantity < 1) {
      showToast("La cantidad debe ser un número entero mayor que cero.", "error");
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
      const updatedReservation = await runTransaction(db, async (transaction) => {
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
        const savedSession = sessionSnapshot.data();
        if (savedReservation.estatus !== "APARTADO") {
          throw new Error("Este apartado ya no está activo y no se puede editar.");
        }
        if (savedSession.estatus !== "ABIERTA") {
          throw new Error("El ID de Venta está cerrado; no se pueden editar sus apartados.");
        }
        if (!Number.isSafeInteger(Number(savedSession.apartadosActivos))) {
          throw new Error("Este ID antiguo necesita que un administrador sincronice el contador antes de editar apartados.");
        }

        const oldQuantity = Number(savedReservation.cantidad);
        const available = Number(product.cantidad ?? 0);
        const quantityDelta = newQuantity - oldQuantity;
        const newAvailable = available - quantityDelta;
        if (!Number.isSafeInteger(oldQuantity) || oldQuantity < 1
          || !Number.isSafeInteger(newAvailable) || newAvailable < 0) {
          throw new Error("No hay suficientes unidades disponibles para esa cantidad.");
        }

        transaction.update(reservationRef, { cantidad: newQuantity });
        transaction.update(sessionRef, {
          apartadosActivos: Number(savedSession.apartadosActivos),
          ultimoApartadoId: reservationRef.id,
        });
        transaction.update(productRef, {
          cantidad: newAvailable,
          precioVenta: Number(savedReservation.precioUnitario),
          estatus: newAvailable === 0 ? "APARTADO" : "DISPONIBLE",
          ultimaAsignacionId: reservationRef.id,
        });

        return { ...savedReservation, cantidad: newQuantity, cantidadDisponible: newAvailable };
      });

      setReservations((current) => current.map((item) => item.id === updatedReservation.id
        ? { ...item, cantidad: updatedReservation.cantidad }
        : item));
      setProducts((current) => current.map((product) => product.id === updatedReservation.idProducto
        ? {
            ...product,
            cantidad: updatedReservation.cantidadDisponible,
            precioVenta: Number(updatedReservation.precioUnitario),
            estatus: updatedReservation.cantidadDisponible === 0 ? "APARTADO" : "DISPONIBLE",
            ultimaAsignacionId: updatedReservation.id,
          }
        : product));
      setSession((current) => current ? { ...current, ultimoApartadoId: updatedReservation.id } : current);
      setReservationToEdit(null);
      showToast(`Cantidad actualizada a ${updatedReservation.cantidad} ${updatedReservation.cantidad === 1 ? "unidad" : "unidades"}.`);
    } catch (editError) {
      console.error(editError);
      showToast(getErrorMessage(editError), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell sales-page">
      <AppNavigation activePage="venta" menuOpen={menuOpen} onClose={setMenuOpen} showUsers={salesRole(profile?.rol) && profile?.rol?.toLowerCase() !== "vendedor"} showSales={salesRole(profile?.rol)} />
      <main className="dashboard-main" id="ventas">
        <header className="topbar">
          <div className="topbar-brand"><button className="mobile-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button><img src={logo} alt="La Vendimia" /></div>
          <div className="topbar-actions"><button className="avatar profile-avatar-trigger" onClick={() => setProfileOpen((open) => !open)} aria-label="Abrir perfil" aria-expanded={profileOpen}>{initials}</button></div>
        </header>
        {profileOpen && <section className="profile-popover" aria-label="Menú de perfil"><div className="profile-popover-head"><span className="avatar profile-popover-avatar">{initials}</span><strong>{name}</strong><span>{profile?.rol || "Usuario"}</span><small>{profile?.email || currentUser?.email}</small></div><div className="profile-popover-bottom"><button onClick={handleLogout}>↪ <span>Cerrar sesión</span></button></div></section>}

        <section className="sales-heading"><div><p>OPERACIÓN EN VIVO</p><h1>Venta</h1></div><div className={`sales-session-status ${sessionIsActive ? "is-open" : ""}`}><span />{sessionIsActive ? "ID de Venta abierto" : "Sin sesión abierta"}</div></section>
        {error && <div className="dashboard-alert" role="alert">{error}</div>}
        {loading ? <div className="sales-loading">Cargando ventas...</div> : !salesRole(profile?.rol) || profile?.activo !== true ? (
          <section className="sales-empty-state"><h2>Acceso no disponible</h2><p>Esta pantalla está habilitada para usuarios Administrador y Vendedor activos.</p></section>
        ) : <>
          <section className="sales-session-bar" aria-label="Sesión de venta">
            <div><span className="sales-overline">ID DE VENTA</span><strong>{session?.id || "Aún no iniciado"}</strong><small>{session ? `Iniciado ${formatDate(session.fechaInicio)}` : "Inicia al comenzar el live"}</small></div>
            {sessionIsActive ? <button className={`sales-session-button${canCloseSession ? " close" : " cancel"}`} disabled={saving || needsCounterMigration} onClick={() => setCloseModalOpen(true)}>{canCloseSession ? "Cerrar ID de Venta" : "Cancelar ID de Venta"}</button> : <button className="sales-session-button" disabled={saving} onClick={startSession}>Iniciar venta</button>}
          </section>

          <div className="sales-layout">
            <section className="sales-workspace">
              <div className="sales-section-title"><span>01</span><div><h2>Buscar producto</h2><p>Busca por clave del catálogo. Solo aparecen unidades disponibles.</p></div></div>
              <div className="sales-search-wrap">
                <label htmlFor="sales-product-search">Clave del producto</label>
                <input id="sales-product-search" autoComplete="off" value={productQuery} disabled={!sessionIsActive || saving || needsCounterMigration} onChange={(event) => { setProductQuery(event.target.value); setSelectedProduct(null); }} onKeyDown={(event) => { if (event.key === "Enter" && matchingProducts[0]) { event.preventDefault(); chooseProduct(matchingProducts[0]); } }} placeholder="Ej. PALLET-001" />
                {matchingProducts.length > 0 && <div className="sales-product-results">{matchingProducts.map((product) => <button key={product.id} type="button" onClick={() => chooseProduct(product)}><span><strong>{product.codigoProducto || product.id}</strong><small>{product.producto || "Producto"} · {product.cantidad ?? 1} disponibles</small></span><b>{money.format(Number(product.precioVenta || 0))}</b></button>)}</div>}
                {normalizeProductKey(productQuery) && matchingProducts.length === 0 && !selectedProduct && <span className="sales-no-client-results" role="status">No se encontraron productos disponibles con esa clave.</span>}
              </div>

              {selectedProduct ? <form className="sales-assignment-form" onSubmit={reserveProduct}>
                <div className="sales-selected-product"><div><span>PRODUCTO</span><strong>{selectedProduct.producto || "Producto"}</strong><small>{selectedProduct.codigoProducto || selectedProduct.id} · {selectedProduct.pallet || "Sin pallet"}</small></div><button type="button" aria-label="Cambiar producto" title="Cambiar producto" onClick={() => { setSelectedProduct(null); setProductQuery(""); }}>×</button></div>
                <div className="sales-fields-row">
                  <fieldset className="sales-quantity"><legend>Unidades <small>{stock} disponibles</small></legend><div><button type="button" aria-label="Quitar una unidad" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><output>{quantity}</output><button type="button" aria-label="Agregar una unidad" disabled={quantity >= stock} onClick={() => setQuantity((value) => Math.min(stock, value + 1))}>+</button></div></fieldset>
                  <label className="sales-price">Precio por unidad<input type="number" min="0" step="0.01" required value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></label>
                </div>
                <label className="sales-client-label" htmlFor="sales-client-search">Cliente</label>
                {clientChoice === "new" ? (
                  <>
                    <label className="sales-client-label" htmlFor="new-client-name">Nombre<input id="new-client-name" maxLength={150} required value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Nombre" /></label>
                    <div className="sales-whatsapp-contact">
                      <label className="sales-client-label" htmlFor="new-client-country-code">Código de país<input id="new-client-country-code" type="tel" inputMode="tel" maxLength={4} pattern="\+[1-9][0-9]{0,2}" required value={newClientCountryCode} onChange={(event) => { setNewClientCountryCode(event.target.value); setNewClientWhatsappConsent(false); }} /></label>
                      <label className="sales-client-label" htmlFor="new-client-phone">Celular / WhatsApp<input id="new-client-phone" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} value={newClientPhone} onChange={(event) => { setNewClientPhone(event.target.value); setNewClientWhatsappConsent(false); }} placeholder="Número de contacto" /></label>
                    </div>
                    <label className="sales-whatsapp-opt-in"><input type="checkbox" checked={newClientWhatsappConsent} onChange={(event) => setNewClientWhatsappConsent(event.target.checked)} />El cliente autorizó recibir recibos por WhatsApp</label>
                  </>
                ) : (
                  <div className="sales-client-picker">
                    <input
                      id="sales-client-search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={clientDropdownOpen}
                      aria-controls="sales-client-options"
                      autoComplete="off"
                      required={!clientChoice}
                      value={clientChoice ? clients.find((client) => client.id === clientChoice)?.nombre || clientSearch : clientSearch}
                      onFocus={() => setClientDropdownOpen(true)}
                      onChange={(event) => { setClientSearch(event.target.value); setClientChoice(""); setClientDropdownOpen(true); }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setClientDropdownOpen(false);
                        if (event.key === "Enter" && clientDropdownOpen) {
                          event.preventDefault();
                          if (matchingClients[0]) {
                            setClientChoice(matchingClients[0].id);
                            setClientSearch(matchingClients[0].nombre);
                            setClientDropdownOpen(false);
                          }
                        }
                      }}
                      placeholder="Buscar cliente..."
                    />
                    {clientDropdownOpen && <div className="sales-client-results" id="sales-client-options" role="listbox">
                      <button type="button" className="sales-new-client-option" onClick={() => { setClientChoice("new"); setClientSearch(""); setClientDropdownOpen(false); setNewClientName(""); setNewClientCountryCode("+52"); setNewClientPhone(""); setNewClientWhatsappConsent(false); }}>+ Dar de alta un cliente</button>
                      {matchingClients.map((client) => <button type="button" role="option" aria-selected={clientChoice === client.id} key={client.id} onClick={() => { setClientChoice(client.id); setClientSearch(client.nombre); setClientDropdownOpen(false); }}>{client.nombre}</button>)}
                      {!matchingClients.length && <span className="sales-no-client-results">No se encontraron clientes.</span>}
                    </div>}
                  </div>
                )}
                <div className="sales-submit-row"><div><small>Total del apartado</small><strong>{money.format(calculatedTotal)}</strong></div><button type="submit" disabled={!canAssign || saving}>{saving ? "Guardando..." : "Apartar producto"}</button></div>
              </form> : <div className="sales-search-hint">{needsCounterMigration ? "Un administrador debe abrir esta página para sincronizar este ID antiguo antes de continuar." : sessionIsActive ? "Selecciona un resultado para revisar el producto y asignarlo." : "Inicia un ID de Venta para habilitar la búsqueda."}</div>}
            </section>

            <section className="sales-reservations">
              <div className="sales-section-title"><span>02</span><div><h2>Apartados de esta sesión</h2><p>Se registran por producto y cliente, pendientes de pago.</p></div><b className="sales-reservation-count">{reservations.length}</b></div>
              {reservations.length > 0 && <div className="sales-reservation-search"><input aria-label="Buscar apartados por cliente o producto" value={reservationQuery} onChange={(event) => setReservationQuery(event.target.value)} placeholder="Buscar cliente o producto..." /><span>{filteredReservations.length} de {reservations.length}</span></div>}
              {filteredReservations.length ? <div className="sales-reservation-list">{visibleReservations.map((reservation) => <article key={reservation.id}><div className="sales-reservation-top"><strong>{reservation.codigoProducto}</strong><span className={reservation.estatus === "DESASIGNADO" ? "is-unassigned" : ""}>{reservation.estatus === "DESASIGNADO" ? "DESASIGNADO" : reservation.estatus}</span></div><div className="sales-reservation-name">{reservation.producto} · {reservation.cantidad} {reservation.cantidad === 1 ? "unidad" : "unidades"}</div><div className="sales-reservation-bottom"><span>{reservation.nombreCliente}</span><strong>{money.format(Number(reservation.cantidad || 0) * Number(reservation.precioUnitario || 0))}</strong></div><div className="sales-reservation-actions"><small>{formatDate(reservation.fechaApartado)}</small>{reservation.estatus === "APARTADO" && <div className="sales-reservation-action-buttons"><button type="button" className="sales-edit-button" disabled={saving} onClick={() => openReservationEdit(reservation)}>Editar</button><button type="button" className="sales-unassign-button" disabled={saving} onClick={() => setReservationToUnassign(reservation)}>Eliminar</button></div>}</div></article>)}</div> : <div className="sales-empty-state compact">{reservations.length ? "No hay apartados que coincidan con la búsqueda." : session ? "Esta sesión aún no tiene apartados." : "Los apartados aparecerán aquí al iniciar un ID de Venta."}</div>}
              {totalReservationPages > 1 && <div className="sales-reservation-pagination"><span>Mostrando {(currentReservationPage - 1) * RESERVATIONS_PER_PAGE + 1}-{Math.min(currentReservationPage * RESERVATIONS_PER_PAGE, filteredReservations.length)} de {filteredReservations.length}</span><div className="pagination"><button type="button" aria-label="Apartados anteriores" disabled={currentReservationPage === 1} onClick={() => setReservationPage((page) => Math.max(1, page - 1))}>‹</button><button type="button" className="current" aria-current="page">{currentReservationPage}</button><button type="button" aria-label="Más apartados" disabled={currentReservationPage === totalReservationPages} onClick={() => setReservationPage((page) => Math.min(totalReservationPages, page + 1))}>›</button></div></div>}
            </section>
          </div>
        </>}
      </main>
      {closeModalOpen && <div className="modal-overlay" role="presentation"><section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="close-sales-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setCloseModalOpen(false)} aria-label="Cerrar">×</button><h2 id="close-sales-title">{canCloseSession ? "Cerrar ID de Venta" : "Cancelar ID de Venta"}</h2><div className="confirm-message">{canCloseSession ? <>¿Quieres cerrar el ID <strong>{session?.id}</strong>? Sus {activeReservationCount} apartados se conservarán en el historial y seguirán pendientes de pago.</> : <>Este ID <strong>{session?.id}</strong> no tiene productos apartados. Al cancelarlo, se eliminará el ID y no aparecerá en el historial.</>}</div><div className="modal-actions"><button type="button" className={canCloseSession ? "users-primary-button" : "danger-button"} disabled={saving} onClick={closeSession}>{saving ? (canCloseSession ? "Cerrando..." : "Cancelando...") : (canCloseSession ? "Cerrar ID de Venta" : "Cancelar ID de Venta")}</button><button type="button" className="modal-cancel" disabled={saving} onClick={() => setCloseModalOpen(false)}>Volver</button></div></section></div>}
      {reservationToEdit && <div className="modal-overlay" role="presentation"><form className="user-modal" role="dialog" aria-modal="true" aria-labelledby="edit-reservation-title" onClick={(event) => event.stopPropagation()} onSubmit={saveReservationEdit}><button type="button" className="modal-close" onClick={() => setReservationToEdit(null)} aria-label="Cerrar" disabled={saving}>×</button><h2 id="edit-reservation-title">Editar cantidad</h2><p className="modal-subtitle">{reservationToEdit.codigoProducto} · {reservationToEdit.producto} · {reservationToEdit.nombreCliente}</p><div className="confirm-message">Cantidad actual: <strong>{reservationToEdit.cantidad}</strong>. Al aumentar se descuentan unidades disponibles; al reducir se devuelven al inventario. El precio por unidad se conserva.</div><label htmlFor="edit-reservation-quantity">Cantidad<input id="edit-reservation-quantity" type="number" inputMode="numeric" min="1" step="1" required autoFocus value={editedReservationQuantity} onChange={(event) => setEditedReservationQuantity(event.target.value)} /></label><div className="modal-actions"><button type="submit" className="users-primary-button" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button><button type="button" className="modal-cancel" onClick={() => setReservationToEdit(null)} disabled={saving}>Cancelar</button></div></form></div>}
      {reservationToUnassign && <div className="modal-overlay" role="presentation"><section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="unassign-sales-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setReservationToUnassign(null)} aria-label="Cerrar">×</button><h2 id="unassign-sales-title">Eliminar apartado</h2><div className="confirm-message">¿Eliminar <strong>{reservationToUnassign.codigoProducto}</strong> de <strong>{reservationToUnassign.nombreCliente}</strong>? El registro desaparecerá del historial y se restaurarán {reservationToUnassign.cantidad} {reservationToUnassign.cantidad === 1 ? "unidad" : "unidades"} disponibles. El precio del catálogo no cambiará.</div><div className="modal-actions"><button type="button" className="danger-button" disabled={saving} onClick={unassignReservation}>{saving ? "Eliminando..." : "Eliminar apartado"}</button><button type="button" className="modal-cancel" disabled={saving} onClick={() => setReservationToUnassign(null)}>Conservar apartado</button></div></section></div>}
      {toast && <div className={`success-toast${toast.type === "error" ? " error-toast" : ""}`} role={toast.type === "error" ? "alert" : "status"}>{toast.message}</div>}
    </div>
  );
}