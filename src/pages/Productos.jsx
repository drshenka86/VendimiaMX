import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, functions } from "../firebase";
import logo from "../public/logo-optimized.png";
import SearchHighlight from "../components/SearchHighlight";
import AppNavigation from "../components/AppNavigation";

const defaultProduct = {
  idPallet: "",
  pallet: "",
  producto: "",
  descripcion: "",
  condicion: "NUEVO",
  cantidad: 1,
  costo: 0,
  precioMercado: 0,
  precioVenta: 0,
  precioVendido: null,
  estatus: "DISPONIBLE",
  idCliente: null,
  fechaAlta: new Date().toISOString().slice(0, 10),
  fechaVenta: null,
};

const defaultPallet = {
  codigo: "",
  costo: 0,
  envio: 0,
  fechaCompra: new Date().toISOString().slice(0, 10),
  estatus: "Activo",
};

export default function Productos() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [perfil, setPerfil] = useState(null);
  const [productos, setProductos] = useState([]);
  const [pallets, setPallets] = useState([]);
  const [query, setQuery] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [palletModalOpen, setPalletModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(defaultProduct);
  const [productIdentifier, setProductIdentifier] = useState("");
  const [palletForm, setPalletForm] = useState(defaultPallet);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function cargarPerfil() {
      if (!currentUser) {
        return;
      }

      try {
        const usuarioRef = doc(db, "usuarios", currentUser.uid);
        const usuarioSnap = await getDoc(usuarioRef);

        if (usuarioSnap.exists()) {
          setPerfil(usuarioSnap.data());
        } else {
          setError("No se encontró el perfil del usuario.");
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar el perfil.");
      }
    }

    async function cargarProductos() {
      try {
        const snapshot = await getDocs(collection(db, "productos"));
        const registros = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setProductos(registros);
      } catch (err) {
        console.error(err);
        setProductos([]);
        setError("No se pudo consultar la colección de productos.");
      }
    }

    async function cargarPallets() {
      try {
        const snapshot = await getDocs(collection(db, "pallets"));
        const registros = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((pallet) => String(pallet.estatus || "").toLowerCase() === "activo")
          .sort((a, b) => String(a.codigo || a.id).localeCompare(String(b.codigo || b.id)));
        setPallets(registros);
      } catch (err) {
        console.error(err);
        setPallets([]);
        setError("No se pudo consultar la colección de pallets.");
      }
    }

    cargarPerfil();
    cargarProductos();
    cargarPallets();
  }, [currentUser]);

  const nombre = perfil?.nombre || currentUser?.displayName || "Usuario";
  const iniciales = nombre
    .split(" ")
    .map((parte) => parte[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const rolActual = String(perfil?.rol || "").trim().toLowerCase();
  const puedeOperarVentas = ["admin", "administrador", "vendedor"].includes(rolActual) && perfil?.activo === true;
  const puedeAdministrarUsuarios = ["admin", "administrador"].includes(rolActual) && perfil?.activo === true;

  const productosFiltrados = useMemo(
    () => productos.filter((producto) => `${producto.codigoProducto || producto.id} ${producto.pallet} ${producto.producto} ${producto.estatus}`.toLowerCase().includes(query.toLowerCase())),
    [productos, query]
  );
  const totalProductPages = Math.max(1, Math.ceil(productosFiltrados.length / 10));
  const paginaActual = Math.min(productPage, totalProductPages);
  const productosVisibles = productosFiltrados.slice((paginaActual - 1) * 10, paginaActual * 10);

  useEffect(() => {
    setProductPage(1);
  }, [query]);

  const openNewProductModal = () => {
    setEditingProduct(null);
    setProductForm({ ...defaultProduct, idPallet: pallets[0]?.id || "", pallet: pallets[0]?.codigo || "", fechaAlta: new Date().toISOString().slice(0, 10), cantidad: 1 });
    setProductIdentifier("");
    setModalOpen(true);
  };

  const openEditProductModal = (producto) => {
    setEditingProduct(producto);
    const codigoPallet = producto.pallet || "";
    const codigoProducto = producto.codigoProducto || "";
    const prefijo = codigoPallet ? `${codigoPallet}-` : "";
    const identificador = codigoProducto.startsWith(prefijo) ? codigoProducto.slice(prefijo.length) : codigoProducto;
    setProductForm({
      ...producto,
      cantidad: producto.cantidad ?? 1,
      fechaAlta: producto.fechaAlta || new Date().toISOString().slice(0, 10),
      idPallet: producto.idPallet || "",
    });
    setProductIdentifier(identificador);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProduct(null);
    setProductForm({ ...defaultProduct, fechaAlta: new Date().toISOString().slice(0, 10), cantidad: 1 });
    setProductIdentifier("");
  };

  const openNewPalletModal = () => {
    setPalletForm({ ...defaultPallet, fechaCompra: new Date().toISOString().slice(0, 10) });
    setPalletModalOpen(true);
  };

  const closePalletModal = () => {
    setPalletModalOpen(false);
    setPalletForm({ ...defaultPallet, fechaCompra: new Date().toISOString().slice(0, 10) });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const codigoPallet = String(productForm.pallet || "").trim().toUpperCase();
      const identificador = String(productIdentifier || "").trim().toUpperCase();
      const codigoProducto = codigoPallet && identificador ? `${codigoPallet}-${identificador}` : "";
      const idProducto = editingProduct?.idProducto || crypto.randomUUID();
      const productValues = { ...productForm };
      delete productValues.id;
      const payload = {
        ...productValues,
        idProducto,
        codigoProducto,
        pallet: codigoPallet,
        cantidad: Number(productForm.cantidad || 1),
        costo: Number(productForm.costo || 0),
        precioMercado: Number(productForm.precioMercado || 0),
        precioVenta: Number(productForm.precioVenta || 0),
        fechaAlta: editingProduct?.fechaAlta || new Date().toISOString().slice(0, 10),
        ...(!editingProduct && { precioVendido: null, idCliente: null, fechaVenta: null }),
      };

      if (!payload.pallet || !identificador || !payload.producto) {
        throw new Error("Los campos pallet, identificador y producto son obligatorios.");
      }

      const productosSnapshot = await getDocs(collection(db, "productos"));
      const duplicate = productosSnapshot.docs.find((item) => {
        const data = item.data();
        const existingCode = data.codigoProducto || data.id || item.id;
        return existingCode === codigoProducto && item.id !== editingProduct?.id;
      });

      if (duplicate) {
        throw new Error(`El código de producto ${codigoProducto} ya está registrado.`);
      }

      if (editingProduct) {
        const targetId = editingProduct.id;
        await updateDoc(doc(db, "productos", targetId), payload);
        setProductos((actuales) => actuales.map((producto) => (producto.id === editingProduct.id ? { ...producto, ...payload } : producto)));
        setToast("Producto actualizado correctamente");
      } else {
        await setDoc(doc(db, "productos", idProducto), payload);
        setProductos((actuales) => [
          ...actuales,
          { id: idProducto, ...payload },
        ]);
        setToast("Producto agregado correctamente");
      }

      closeModal();
      window.setTimeout(() => setToast(""), 3500);
    } catch (err) {
      console.error(err);
      const mensaje = err?.message || `No se pudo guardar el producto (${err?.code || "unknown"}).`;
      setToastError(mensaje);
      window.setTimeout(() => setToastError(""), 4500);
    } finally {
      setSaving(false);
    }
  };

  const handlePalletSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const codigo = palletForm.codigo.trim().toUpperCase();
      const idPallet = crypto.randomUUID();
      const payload = {
        idPallet,
        codigo,
        costo: Number(palletForm.costo || 0),
        envio: Number(palletForm.envio || 0),
        fechaCompra: palletForm.fechaCompra || new Date().toISOString().slice(0, 10),
        estatus: palletForm.estatus,
      };

      if (!codigo) {
        throw new Error("El código del pallet es obligatorio.");
      }

      const palletQuery = await getDocs(collection(db, "pallets"));
      const palletSnap = palletQuery.docs.find((item) => String(item.data().codigo || "").toUpperCase() === codigo);

      if (palletSnap) {
        throw new Error(`El pallet ${codigo} ya está registrado.`);
      }

      const palletRef = doc(db, "pallets", idPallet);
      await setDoc(palletRef, payload);
      setPallets((actuales) => [...actuales, { id: idPallet, ...payload }].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo))));
      closePalletModal();
      setToast("Pallet registrado correctamente");
      window.setTimeout(() => setToast(""), 3500);
    } catch (err) {
      console.error(err);
      setToastError(err?.message || `No se pudo registrar el pallet (${err?.code || "unknown"}).`);
      window.setTimeout(() => setToastError(""), 4500);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete?.id) {
      return;
    }

    setSaving(true);
    try {
      const deleteProductSafely = httpsCallable(functions, "deleteProductSafely");
      await deleteProductSafely({ productId: productToDelete.id });
      setProductos((actuales) => actuales.filter((producto) => producto.id !== productToDelete.id));
      setProductToDelete(null);
      setToast("Producto eliminado correctamente");
      window.setTimeout(() => setToast(""), 3500);
    } catch (err) {
      console.error(err);
      const code = String(err?.code || "").split("/").pop();
      const message = code === "failed-precondition"
        ? "No se puede eliminar un producto con apartados pendientes."
        : `No se pudo eliminar el producto (${code || "unknown"}).`;
      setToastError(message);
      window.setTimeout(() => setToastError(""), 4500);
    } finally {
      setSaving(false);
    }
  };

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell users-page products-page">
      <AppNavigation activePage="productos" menuOpen={menuOpen} onClose={setMenuOpen} showUsers={puedeAdministrarUsuarios} showSales={puedeOperarVentas} />

      <main className="dashboard-main" id="productos">
        <header className="topbar">
          <div className="topbar-brand">
            <button className="mobile-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} onClick={() => setMenuOpen((abierto) => !abierto)}>{menuOpen ? "×" : "☰"}</button>
            <img src={logo} alt="La Vendimia" />
          </div>
          <div className="topbar-actions"><button className="icon-button" title="Notificaciones" aria-label="Notificaciones">✉<span className="notification-dot" /></button><button className="avatar profile-avatar-trigger" onClick={() => setProfileOpen((abierto) => !abierto)} aria-label="Abrir perfil" aria-expanded={profileOpen}>{iniciales}</button></div>
        </header>

        {profileOpen && <section className="profile-popover" aria-label="Menú de perfil">
          <div className="profile-popover-head"><span className="avatar profile-popover-avatar">{iniciales}</span><strong>{nombre}</strong><span>{perfil?.rol || "Administrador"}</span><small>{perfil?.email || currentUser?.email}</small></div>
          <div className="profile-popover-links profile-popover-bottom"><button onClick={handleLogout}>↪ <span>Cerrar sesión</span></button></div>
        </section>}

        {error && <div className="dashboard-alert">{error}</div>}

        <section className="users-heading">
          <h1>Productos</h1>
          <div className="page-actions">
            {puedeAdministrarUsuarios && <button className="secondary-action-button" type="button" onClick={openNewPalletModal}>＋ Nuevo pallet</button>}
            {puedeAdministrarUsuarios && <button className="users-primary-button" type="button" onClick={openNewProductModal}>＋ Nuevo producto</button>}
          </div>
        </section>

        <section className="users-card">
          <div className="users-toolbar">
            <label className="users-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto..." aria-label="Buscar producto" /></label>
            <span className="users-count">{productosFiltrados.length} productos</span>
          </div>

          <div className="users-table-wrap">
            {productosVisibles.length ? (
              <table className="users-table products-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Pallet</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Precio</th>
                    <th>Estatus</th>
                    {puedeAdministrarUsuarios && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {productosVisibles.map((producto) => (
                    <tr key={producto.id || producto.producto}>
                      <td data-label="ID"><strong><SearchHighlight value={producto.codigoProducto || producto.id} query={query} /></strong></td>
                      <td data-label="Pallet"><SearchHighlight value={producto.pallet} query={query} /></td>
                      <td data-label="Producto"><strong><SearchHighlight value={producto.producto || "Sin nombre"} query={query} /></strong></td>
                      <td data-label="Cantidad">{producto.cantidad ?? 1}</td>
                      <td data-label="Precio">${Number(producto.precioVenta || 0).toFixed(2)}</td>
                      <td data-label="Estatus"><span className={`status-pill ${producto.estatus === "VENDIDO" ? "inactive" : ""}`}>{producto.estatus === "NUEVO" ? "Nuevo" : producto.estatus === "APARTADO" ? "Apartado" : producto.estatus === "VENDIDO" ? "Vendido" : producto.estatus === "CANCELADO" ? "Cancelado" : "Disponible"}</span></td>
                      {puedeAdministrarUsuarios && <td data-label="Acciones">
                        <button className="table-action" onClick={() => openEditProductModal(producto)}>Editar</button>
                        <button className="table-action danger" onClick={() => setProductToDelete(producto)}>Eliminar</button>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="users-empty">{error || (query ? "No hay productos que coincidan con la búsqueda." : "No hay productos registrados en Firebase.")}</div>
            )}
          </div>

          <div className="users-footer">
            <span>Mostrando {productosFiltrados.length ? (paginaActual - 1) * 10 + 1 : 0}-{Math.min(paginaActual * 10, productosFiltrados.length)} de {productosFiltrados.length}</span>
            <div className="pagination">
              <button disabled={paginaActual === 1} onClick={() => setProductPage((pagina) => Math.max(1, pagina - 1))}>‹</button>
              <button className="current">{paginaActual}</button>
              <button disabled={paginaActual === totalProductPages} onClick={() => setProductPage((pagina) => Math.min(totalProductPages, pagina + 1))}>›</button>
            </div>
          </div>
        </section>
      </main>

      {modalOpen && (
        <div className="modal-overlay" role="presentation">
          <form className="user-modal" role="dialog" aria-modal="true" aria-labelledby="product-title" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
            <button type="button" className="modal-close" onClick={closeModal} aria-label="Cerrar">×</button>
            <h2 id="product-title">{editingProduct ? "Editar producto" : "Nuevo producto"}</h2>

            <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label>Pallet<select required value={productForm.idPallet} onChange={(event) => { const pallet = pallets.find((item) => item.id === event.target.value); setProductForm({ ...productForm, idPallet: event.target.value, pallet: pallet?.codigo || "" }); }}>
                <option value="">Selecciona un pallet activo</option>
                {pallets.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.codigo || pallet.id}</option>)}
              </select></label>
              <label>Identificador del producto<input required value={productIdentifier} onChange={(event) => setProductIdentifier(event.target.value.replace(/[^a-zA-Z0-9-_]/g, ""))} placeholder="Ej. 001" /></label>
              <div className="product-id-preview" style={{ gridColumn: "1 / -1" }}><span>Código del producto</span><strong>{productForm.pallet && productIdentifier ? `${productForm.pallet}-${productIdentifier.toUpperCase()}` : "Se generará al seleccionar pallet e identificador"}</strong></div>
              <label style={{ gridColumn: "1 / -1" }}>Producto<input required value={productForm.producto} onChange={(event) => setProductForm({ ...productForm, producto: event.target.value })} placeholder="Ej. Cafetera programable de 12 tazas" /></label>
              <label className="product-description-field" style={{ gridColumn: "1 / -1" }}><span>Descripción</span><textarea rows="4" value={productForm.descripcion} onChange={(event) => setProductForm({ ...productForm, descripcion: event.target.value })} placeholder="Agrega características, estado y detalles relevantes del producto" /></label>
              <label>Condición<select value={productForm.condicion} onChange={(event) => setProductForm({ ...productForm, condicion: event.target.value })}><option value="NUEVO">Nuevo</option><option value="NUEVO_EMPAQUE_DANADO">Nuevo empaque dañado</option><option value="USADO">Usado</option><option value="INCOMPLETO">Incompleto</option><option value="DANADO">Dañado</option></select></label>
              <label>Estatus<select value={productForm.estatus} onChange={(event) => setProductForm({ ...productForm, estatus: event.target.value })}><option value="DISPONIBLE">Disponible</option><option value="APARTADO">Apartado</option><option value="VENDIDO">Vendido</option><option value="CANCELADO">Cancelado</option></select></label>
              <label>Costo<input type="number" min="0" step="0.01" value={productForm.costo} onChange={(event) => setProductForm({ ...productForm, costo: event.target.value })} placeholder="0.00" /></label>
              <label>Precio de mercado<input type="number" min="0" step="0.01" value={productForm.precioMercado} onChange={(event) => setProductForm({ ...productForm, precioMercado: event.target.value })} placeholder="0.00" /></label>
              <label>Precio de venta<input type="number" min="0" step="0.01" value={productForm.precioVenta} onChange={(event) => setProductForm({ ...productForm, precioVenta: event.target.value })} placeholder="0.00" /></label>
              <label>Cantidad<input type="number" min="1" value={productForm.cantidad} onChange={(event) => setProductForm({ ...productForm, cantidad: Number(event.target.value || 1) })} placeholder="1" /></label>
            </div>

            <div className="modal-actions">
              <button type="submit" className="users-primary-button" disabled={saving}>{saving ? "Guardando..." : editingProduct ? "Guardar cambios" : "Guardar producto"}</button>
              <button type="button" className="modal-cancel" onClick={closeModal}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {productToDelete && (
        <div className="modal-overlay" role="presentation">
          <section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-product-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setProductToDelete(null)} aria-label="Cerrar">×</button>
            <h2 id="delete-product-title">Eliminar producto</h2>
            <div className="confirm-message">¿Quieres eliminar el producto <strong>{productToDelete.producto}</strong>? Esta acción no se puede deshacer.</div>
            <div className="modal-actions">
              <button className="danger-button" onClick={handleDeleteProduct} disabled={saving}>{saving ? "Eliminando..." : "Eliminar producto"}</button>
              <button className="modal-cancel" onClick={() => setProductToDelete(null)}>Cancelar</button>
            </div>
          </section>
        </div>
      )}

      {palletModalOpen && (
        <div className="modal-overlay" role="presentation">
          <form className="user-modal" role="dialog" aria-modal="true" aria-labelledby="pallet-title" onClick={(event) => event.stopPropagation()} onSubmit={handlePalletSubmit}>
            <button type="button" className="modal-close" onClick={closePalletModal} aria-label="Cerrar">×</button>
            <h2 id="pallet-title">Nuevo pallet</h2>

            <label>Código del pallet<input required value={palletForm.codigo} onChange={(event) => setPalletForm({ ...palletForm, codigo: event.target.value.toUpperCase() })} placeholder="P001" /></label>
            <div className="pallet-form-grid">
              <label>Costo<input required type="number" min="0" step="0.01" value={palletForm.costo} onChange={(event) => setPalletForm({ ...palletForm, costo: event.target.value })} placeholder="4500.00" /></label>
              <label>Envío<input required type="number" min="0" step="0.01" value={palletForm.envio} onChange={(event) => setPalletForm({ ...palletForm, envio: event.target.value })} placeholder="850.00" /></label>
            </div>
            <div className="pallet-form-grid">
              <label>Fecha de compra<input required type="date" value={palletForm.fechaCompra} onChange={(event) => setPalletForm({ ...palletForm, fechaCompra: event.target.value })} /></label>
              <label>Estatus<select value={palletForm.estatus} onChange={(event) => setPalletForm({ ...palletForm, estatus: event.target.value })}><option value="Activo">Activo</option><option value="Finalizado">Finalizado</option><option value="Cancelado">Cancelado</option></select></label>
            </div>

            <div className="modal-actions">
              <button type="submit" className="users-primary-button" disabled={saving}>{saving ? "Guardando..." : "Guardar pallet"}</button>
              <button type="button" className="modal-cancel" onClick={closePalletModal}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="success-toast" role="status">{toast}</div>}
      {toastError && <div className="success-toast error-toast" role="alert">{toastError}</div>}
    </div>
  );
}
