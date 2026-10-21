# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:


## Estado de producción

El frontend está preparado para desplegarse como SPA en Vercel. `vercel.json` configura el rewrite necesario para que las rutas de React funcionen al refrescar la página.

La administración de usuarios y la eliminación segura de productos/clientes dependen de Cloud Functions (`createManagedUser`, `deleteProductSafely` y `deleteClientSafely`). Deben desplegarse antes de publicar una versión del frontend que use esas acciones.

### Despliegue

Despliega los recursos de Firebase por separado y siempre especifica el proyecto destino. No ejecutes `firebase deploy` sin `--only`.

```sh
firebase deploy --only functions:createManagedUser,functions:deleteProductSafely,functions:deleteClientSafely --project ID_DEL_PROYECTO
firebase deploy --only firestore:rules --project ID_DEL_PROYECTO
```

Para el frontend, importa el repositorio en Vercel, configura las variables `VITE_FIREBASE_*` y valida login, dashboard, venta, apartados y administración en Preview antes de promover a producción. No se realizan despliegues automáticamente desde este proyecto.
## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
