import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import AdminRoute from "./components/AdminRoute";
import "./styles/app.css";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Productos = lazy(() => import("./pages/Productos"));
const Ventas = lazy(() => import("./pages/Ventas"));
const Apartados = lazy(() => import("./pages/Apartados"));
const ConfiguracionRecibo = lazy(() => import("./pages/ConfiguracionRecibo"));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="business-loading">Cargando página...</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/usuarios"
              element={
                <PrivateRoute>
                  <AdminRoute>
                    <Usuarios />
                  </AdminRoute>
                </PrivateRoute>
              }
            />
            <Route
              path="/configuracion-recibo"
              element={
                <PrivateRoute>
                  <AdminRoute>
                    <ConfiguracionRecibo />
                  </AdminRoute>
                </PrivateRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <PrivateRoute>
                  <AdminRoute>
                    <Clientes />
                  </AdminRoute>
                </PrivateRoute>
              }
            />
            <Route
              path="/productos"
              element={
                <PrivateRoute>
                  <Productos />
                </PrivateRoute>
              }
            />
            <Route
              path="/venta"
              element={
                <PrivateRoute>
                  <Ventas />
                </PrivateRoute>
              }
            />
            <Route
              path="/ventas"
              element={
                <PrivateRoute>
                  <Apartados />
                </PrivateRoute>
              }
            />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

