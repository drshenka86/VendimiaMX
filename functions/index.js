const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

initializeApp();
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

async function requireActiveAdmin(uid) {
  const profile = await getFirestore().collection("usuarios").doc(uid).get();
  const role = String(profile.data()?.rol || "").trim().toLowerCase();
  if (!profile.exists || profile.data()?.activo !== true
    || !["admin", "administrador"].includes(role)) {
    throw new HttpsError("permission-denied", "No tienes permisos para realizar esta operación.");
  }
}

exports.createManagedUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para crear usuarios.");
  }

  const requester = await getFirestore().collection("usuarios").doc(request.auth.uid).get();
  const requesterData = requester.data();
  const requesterRole = String(requesterData?.rol || "").trim().toLowerCase();
  if (!requester.exists || requesterData?.activo !== true
    || !["admin", "administrador"].includes(requesterRole)) {
    throw new HttpsError("permission-denied", "No tienes permisos para crear usuarios.");
  }

  const { nombre, email, rol } = request.data || {};
  if (!nombre || !email || !["Administrador", "Vendedor", "Consulta"].includes(rol)) {
    throw new HttpsError("invalid-argument", "Nombre, correo y rol son obligatorios.");
  }

  let userRecord;
  try {
    userRecord = await getAuth().createUser({
      displayName: nombre,
      email,
      emailVerified: false,
      disabled: false,
      password: `${crypto.randomUUID()}Aa1!`,
    });

    await getFirestore().collection("usuarios").doc(userRecord.uid).set({
      nombre,
      email,
      rol,
      activo: true,
      creadoEn: FieldValue.serverTimestamp(),
      authUid: userRecord.uid,
    });

    return { uid: userRecord.uid, email: userRecord.email };
  } catch (error) {
    if (userRecord) {
      const userProfileRef = getFirestore().collection("usuarios").doc(userRecord.uid);
      try {
        await userProfileRef.delete();
      } catch (rollbackProfileError) {
        console.error("No se pudo limpiar el perfil del usuario incompleto:", rollbackProfileError);
      }
      try {
        await getAuth().deleteUser(userRecord.uid);
      } catch (rollbackAuthError) {
        console.error("No se pudo limpiar la cuenta Auth incompleta:", rollbackAuthError);
      }
    }
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
    }
    console.error(error);
    throw new HttpsError("internal", "No se pudo crear el usuario.");
  }
});

exports.deleteProductSafely = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para eliminar productos.");
  }
  await requireActiveAdmin(request.auth.uid);

  const productId = String(request.data?.productId || "").trim();
  if (!productId) {
    throw new HttpsError("invalid-argument", "Falta el identificador del producto.");
  }

  const firestore = getFirestore();
  const productRef = firestore.collection("productos").doc(productId);
  const reservationsQuery = firestore.collection("apartados").where("idProducto", "==", productId);
  await firestore.runTransaction(async (transaction) => {
    const productSnapshot = await transaction.get(productRef);
    if (!productSnapshot.exists) {
      throw new HttpsError("not-found", "No se encontró el producto.");
    }

    const reservationsSnapshot = await transaction.get(reservationsQuery);
    const hasActiveReservation = reservationsSnapshot.docs.some((reservation) => reservation.data().estatus === "APARTADO");
    if (hasActiveReservation) {
      throw new HttpsError("failed-precondition", "No se puede eliminar un producto con apartados pendientes.");
    }

    transaction.delete(productRef);
  });

  return { productId };
});

exports.deleteClientSafely = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para eliminar clientes.");
  }
  await requireActiveAdmin(request.auth.uid);

  const clientId = String(request.data?.clientId || "").trim();
  if (!clientId) {
    throw new HttpsError("invalid-argument", "Falta el identificador del cliente.");
  }

  const firestore = getFirestore();
  const clientRef = firestore.collection("clientes").doc(clientId);
  const reservationsQuery = firestore.collection("apartados").where("idCliente", "==", clientId);
  await firestore.runTransaction(async (transaction) => {
    const clientSnapshot = await transaction.get(clientRef);
    if (!clientSnapshot.exists) {
      throw new HttpsError("not-found", "No se encontró el cliente.");
    }

    const reservationsSnapshot = await transaction.get(reservationsQuery);
    const hasActiveReservation = reservationsSnapshot.docs.some((reservation) => reservation.data().estatus === "APARTADO");
    if (hasActiveReservation) {
      throw new HttpsError("failed-precondition", "No se puede eliminar un cliente con apartados pendientes.");
    }

    transaction.delete(clientRef);
  });

  return { clientId };
});
