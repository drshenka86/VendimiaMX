import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { auth } from "../firebase";
import { db, functions } from "../firebase";
import logo from "../public/logo-optimized.png";
import SearchHighlight from "../components/SearchHighlight";
import AppNavigation from "../components/AppNavigation";

export default function Usuarios() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [query, setQuery] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newUser, setNewUser] = useState({ nombre: "", email: "", rol: "Consulta" });
  const [editingUser, setEditingUser] = useState(null);
  const [userToDeactivate, setUserToDeactivate] = useState(null);

  useEffect(() => {
    async function cargarUsuarios() {
      try {
        const snapshot = await getDocs(collection(db, "usuarios"));
        const registros = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setUsuarios(registros);
      } catch (err) {
        console.error(err);
        setUsuarios([]);
        const codigo = err?.code || "unknown";
        setError(`No se pudo consultar la colección de usuarios (${codigo}).`);
      }

      if (currentUser) {
        try {
          const perfilSnapshot = await getDoc(doc(db, "usuarios", currentUser.uid));
          if (perfilSnapshot.exists()) {
            setPerfil(perfilSnapshot.data());
          }
        } catch (err) {
          console.error("No se pudo cargar el perfil del usuario:", err);
        }
      }
    }
    cargarUsuarios();
  }, [currentUser]);

  const nombre = perfil?.nombre || currentUser?.displayName || "Usuario";
  const iniciales = nombre.split(" ").map((parte) => parte[0]).slice(0, 2).join("").toUpperCase();
  const usuariosFiltrados = useMemo(() => usuarios.filter((usuario) => `${usuario.id} ${usuario.nombre} ${usuario.email} ${usuario.rol}`.toLowerCase().includes(query.toLowerCase())), [usuarios, query]);
  const totalUserPages = Math.max(1, Math.ceil(usuariosFiltrados.length / 10));
  const paginaUsuarios = Math.min(userPage, totalUserPages);
  const usuariosVisibles = usuariosFiltrados.slice((paginaUsuarios - 1) * 10, paginaUsuarios * 10);
  const esAdministrador = (rol) => ["admin", "administrador"].includes(String(rol || "").trim().toLowerCase());
  const administradorActual = esAdministrador(perfil?.rol);

  useEffect(() => {
    setUserPage(1);
  }, [query]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (editingUser) {
        const cambios = { nombre: newUser.nombre, email: newUser.email, rol: newUser.rol };
        await updateDoc(doc(db, "usuarios", editingUser.id), cambios);
        setUsuarios((usuariosActuales) => usuariosActuales.map((usuario) => usuario.id === editingUser.id ? { ...usuario, ...cambios } : usuario));
        setEditingUser(null);
        setNewUser({ nombre: "", email: "", rol: "Consulta" });
        setModalOpen(false);
        setToast("Usuario modificado correctamente");
        window.setTimeout(() => setToast(""), 3500);
        return;
      }

      const createManagedUser = httpsCallable(functions, "createManagedUser");
      const resultado = await createManagedUser(newUser);
      const usuario = { id: resultado.data.uid, ...newUser, activo: true };
      setUsuarios((usuariosActuales) => [...usuariosActuales, usuario]);
      setNewUser({ nombre: "", email: "", rol: "Consulta" });
      setModalOpen(false);
      try {
        await sendPasswordResetEmail(auth, resultado.data.email);
        setToast("Usuario creado correctamente. Se envió el correo para definir su contraseña.");
        window.setTimeout(() => setToast(""), 5000);
      } catch (emailError) {
        console.error("El usuario se creó, pero no se pudo enviar el correo de acceso:", emailError);
        setToastError("El usuario se creó, pero no se pudo enviar el correo para definir su contraseña. Puedes reenviarlo desde Firebase Authentication.");
        window.setTimeout(() => setToastError(""), 6500);
      }
    } catch (err) {
      console.error(err);
      const mensaje = `No se pudo crear el usuario (${err?.code || "unknown"}).`;
      setError("");
      setToastError(mensaje);
      window.setTimeout(() => setToastError(""), 4500);
    } finally {
      setSaving(false);
    }
  }

  function handleEditUser(usuario) {
    setEditingUser(usuario);
    setNewUser({ nombre: usuario.nombre || "", email: usuario.email || "", rol: usuario.rol || "Consulta" });
    setModalOpen(true);
  }

  async function handleToggleUser() {
    if (!userToDeactivate?.id) {
      return;
    }

    const activar = userToDeactivate.accion === "activar";
    setSaving(true);
    try {
      await updateDoc(doc(db, "usuarios", userToDeactivate.id), { activo: activar });
      setUsuarios((usuariosActuales) => usuariosActuales.map((usuario) => usuario.id === userToDeactivate.id ? { ...usuario, activo: activar } : usuario));
      setUserToDeactivate(null);
      setToast(activar ? "Usuario activado correctamente" : "Usuario desactivado correctamente");
      window.setTimeout(() => setToast(""), 3500);
    } catch (err) {
      console.error(err);
      setError(`No se pudo ${activar ? "activar" : "desactivar"} el usuario (${err?.code || "unknown"}).`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell users-page">
      <AppNavigation activePage="usuarios" menuOpen={menuOpen} onClose={setMenuOpen} showUsers showSales />

      <main className="dashboard-main" id="usuarios">
        <header className="topbar">
          <div className="topbar-brand"><button className="mobile-menu" aria-expanded={menuOpen} aria-label="Abrir menú" onClick={() => setMenuOpen((abierto) => !abierto)}>☰</button><img src={logo} alt="La Vendimia" /></div>
          <div className="topbar-actions"><button className="icon-button" title="Notificaciones" aria-label="Notificaciones">✉<span className="notification-dot" /></button><button className="avatar profile-avatar-trigger" onClick={() => setProfileOpen((abierto) => !abierto)} aria-label="Abrir perfil">{iniciales}</button></div>
        </header>
        {profileOpen && <section className="profile-popover" aria-label="Menú de perfil"><div className="profile-popover-head"><span className="avatar profile-popover-avatar">{iniciales}</span><strong>{nombre}</strong><span>{perfil?.rol || "Administrador"}</span><small>{perfil?.email || currentUser?.email}</small></div><div className="profile-popover-bottom"><button onClick={handleLogout}>↪ <span>Cerrar sesión</span></button></div></section>}

        <section className="users-heading"><h1>Usuarios</h1><button className="users-primary-button" onClick={() => { setEditingUser(null); setNewUser({ nombre: "", email: "", rol: "Consulta" }); setModalOpen(true); }}>＋ Nuevo usuario</button></section>
        {error && <div className="dashboard-alert">{error}</div>}
        <section className="users-card">
          <div className="users-toolbar"><label className="users-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar usuario..." aria-label="Buscar usuario" /></label><span className="users-count">{usuariosFiltrados.length} usuarios</span></div>
          <div className="users-table-wrap">{usuariosVisibles.length ? <table className="users-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{usuariosVisibles.map((usuario) => { const administrador = esAdministrador(usuario.rol); const esPropio = usuario.id === currentUser?.uid; const puedeEditar = !administradorActual || !administrador || esPropio; return <tr key={usuario.id || usuario.email}><td data-label="Nombre"><strong><SearchHighlight value={usuario.nombre || "Sin nombre"} query={query} /></strong></td><td data-label="Correo"><span className="user-email-value"><SearchHighlight value={usuario.email || "-"} query={query} /></span></td><td data-label="Rol"><span className="role-pill"><SearchHighlight value={usuario.rol || "Sin rol"} query={query} /></span></td><td data-label="Estado"><span className={`status-pill ${usuario.activo === false ? "inactive" : ""}`}>{usuario.activo === false ? "Inactivo" : "Activo"}</span></td><td data-label="Acciones"><button className="table-action" disabled={!puedeEditar} onClick={() => handleEditUser(usuario)}>Editar</button>{usuario.activo === false ? <button className="table-action activate" onClick={() => setUserToDeactivate({ ...usuario, accion: "activar" })}>Activar</button> : <button className="table-action danger" disabled={administrador} onClick={() => setUserToDeactivate({ ...usuario, accion: "desactivar" })}>Desactivar</button>}</td></tr>; })}</tbody></table> : <div className="users-empty">{error || (query ? "No hay usuarios que coincidan con la búsqueda." : "No hay usuarios registrados en Firebase.")}</div>}</div>
          <div className="users-footer"><span>Mostrando {usuariosFiltrados.length ? (paginaUsuarios - 1) * 10 + 1 : 0}-{Math.min(paginaUsuarios * 10, usuariosFiltrados.length)} de {usuariosFiltrados.length}</span><div className="pagination"><button disabled={paginaUsuarios === 1} onClick={() => setUserPage((pagina) => Math.max(1, pagina - 1))}>‹</button><button className="current">{paginaUsuarios}</button><button disabled={paginaUsuarios === totalUserPages} onClick={() => setUserPage((pagina) => Math.min(totalUserPages, pagina + 1))}>›</button></div></div>
        </section>
      </main>
      {modalOpen && <div className="modal-overlay" role="presentation"><form className="user-modal" role="dialog" aria-modal="true" aria-labelledby="new-user-title" onClick={(event) => event.stopPropagation()} onSubmit={handleCreateUser}><button type="button" className="modal-close" onClick={() => { setModalOpen(false); setEditingUser(null); }} aria-label="Cerrar">×</button><h2 id="new-user-title">{editingUser ? "Editar usuario" : "Nuevo usuario"}</h2><label>Nombre completo<input required value={newUser.nombre} onChange={(event) => setNewUser({ ...newUser, nombre: event.target.value })} placeholder="Nombre completo" /></label><label>Correo electrónico<input disabled={Boolean(editingUser && administradorActual)} required type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} placeholder="Correo electrónico" /></label><label>Rol<select disabled={Boolean(editingUser && administradorActual)} value={newUser.rol} onChange={(event) => setNewUser({ ...newUser, rol: event.target.value })}><option>Administrador</option><option>Vendedor</option><option>Consulta</option></select></label><div className="modal-actions"><button type="submit" className="users-primary-button" disabled={saving}>{saving ? "Guardando..." : editingUser ? "Guardar cambios" : "Crear usuario"}</button><button type="button" className="modal-cancel" onClick={() => { setModalOpen(false); setEditingUser(null); }}>Cancelar</button></div></form></div>}
      {userToDeactivate && <div className="modal-overlay" role="presentation"><section className="user-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="toggle-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setUserToDeactivate(null)} aria-label="Cerrar">×</button><h2 id="toggle-title">{userToDeactivate.accion === "activar" ? "Activar usuario" : "Desactivar usuario"}</h2><div className="confirm-message">¿Quieres {userToDeactivate.accion === "activar" ? "activar" : "desactivar"} a <strong>{userToDeactivate.nombre || userToDeactivate.email}</strong>? {userToDeactivate.accion === "activar" ? "El usuario volverá a aparecer como activo." : "El usuario dejará de aparecer como activo."}</div><div className="modal-actions"><button className={userToDeactivate.accion === "activar" ? "activate-button" : "danger-button"} onClick={handleToggleUser} disabled={saving}>{saving ? "Guardando..." : userToDeactivate.accion === "activar" ? "Activar usuario" : "Desactivar usuario"}</button><button className="modal-cancel" onClick={() => setUserToDeactivate(null)}>Cancelar</button></div></section></div>}
      {toast && <div className="success-toast" role="status">{toast}</div>}
      {toastError && <div className="success-toast error-toast" role="alert">{toastError}</div>}
    </div>
  );
}
