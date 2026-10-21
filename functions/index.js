const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret, defineString } = require("firebase-functions/params");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");
const { createReceiptPdf } = require("./receiptPdf");

initializeApp();
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

const whatsappAccessToken = defineSecret("WHATSAPP_ACCESS_TOKEN");
const whatsappPhoneNumberId = defineString("WHATSAPP_PHONE_NUMBER_ID");
const whatsappTemplateName = defineString("WHATSAPP_RECEIPT_TEMPLATE_NAME", { default: "recibo_compra" });
const whatsappTemplateLanguage = defineString("WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE", { default: "es_MX" });
const whatsappGraphVersion = defineString("WHATSAPP_GRAPH_API_VERSION", { default: "v26.0" });

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

exports.sendWhatsappReceipt = onCall({ secrets: [whatsappAccessToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para enviar recibos.");
  }

  const profileSnapshot = await getFirestore().collection("usuarios").doc(request.auth.uid).get();
  const profile = profileSnapshot.data();
  const role = String(profile?.rol || "").trim().toLowerCase();
  if (!profileSnapshot.exists || profile?.activo !== true
    || !["admin", "administrador", "vendedor"].includes(role)) {
    throw new HttpsError("permission-denied", "No tienes permiso para enviar recibos.");
  }

  const clientId = String(request.data?.clientId || "").trim();
  const sessionId = String(request.data?.sessionId || "").trim();
  const paymentView = request.data?.paymentView;
  if (!clientId || clientId.length > 150 || !sessionId || sessionId.length > 150
    || !["PENDIENTES", "PAGADOS"].includes(paymentView)) {
    throw new HttpsError("invalid-argument", "Selecciona una cuenta válida para generar el recibo.");
  }

  const firestore = getFirestore();
  const [clientSnapshot, sessionSnapshot, reservationsSnapshot, settingsSnapshot] = await Promise.all([
    firestore.collection("clientes").doc(clientId).get(),
    firestore.collection("sesionesVenta").doc(sessionId).get(),
    firestore.collection("apartados").where("idVenta", "==", sessionId).get(),
    firestore.collection("configuracionRecibos").doc("datosPago").get(),
  ]);
  if (!clientSnapshot.exists || !sessionSnapshot.exists) {
    throw new HttpsError("not-found", "No se encontró el cliente o el ID de Venta.");
  }

  const client = clientSnapshot.data();
  if (client.aceptaWhatsApp !== true) {
    throw new HttpsError("failed-precondition", "El cliente no ha autorizado recibir recibos por WhatsApp.");
  }
  const phoneDigits = `${client.codigoPais || ""}${client.celular || ""}`.replace(/\D/g, "");
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    throw new HttpsError("failed-precondition", "El cliente necesita un número de WhatsApp válido con código de país.");
  }

  const expectedStatus = paymentView === "PAGADOS" ? "PAGADO" : "APARTADO";
  const items = reservationsSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
    .filter((reservation) => reservation.idCliente === clientId && reservation.estatus === expectedStatus);
  if (!items.length) {
    throw new HttpsError("not-found", "No hay apartados para incluir en este recibo.");
  }

  const phoneNumberId = whatsappPhoneNumberId.value();
  const accessToken = whatsappAccessToken.value();
  if (!phoneNumberId || !accessToken) {
    throw new HttpsError("failed-precondition", "WhatsApp Business aún no está configurado.");
  }

  const { buffer, filename, total } = createReceiptPdf({
    clientName: String(client.nombre || "Cliente"),
    sessionId,
    purchaseDate: sessionSnapshot.data().fechaInicio,
    status: paymentView,
    items,
    paymentSettings: settingsSnapshot.exists ? settingsSnapshot.data() : undefined,
  });
  const graphBaseUrl = `https://graph.facebook.com/${whatsappGraphVersion.value()}`;

  try {
    const uploadForm = new FormData();
    uploadForm.append("messaging_product", "whatsapp");
    uploadForm.append("file", new Blob([buffer], { type: "application/pdf" }), filename);
    const uploadResponse = await fetch(`${graphBaseUrl}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: uploadForm,
    });
    const uploadResult = await uploadResponse.json();
    if (!uploadResponse.ok || !uploadResult.id) {
      console.error("WhatsApp PDF upload failed", { status: uploadResponse.status, code: uploadResult.error?.code });
      throw new Error("media-upload-failed");
    }

    const messageResponse = await fetch(`${graphBaseUrl}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: `+${phoneDigits}`,
        type: "template",
        template: {
          name: whatsappTemplateName.value(),
          language: { code: whatsappTemplateLanguage.value() },
          components: [
            {
              type: "header",
              parameters: [{ type: "document", document: { id: uploadResult.id, filename } }],
            },
            {
              type: "body",
              parameters: [
                { type: "text", text: String(client.nombre || "Cliente") },
                { type: "text", text: sessionId },
                { type: "text", text: new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(total) },
              ],
            },
          ],
        },
      }),
    });
    const messageResult = await messageResponse.json();
    if (!messageResponse.ok || !messageResult.messages?.[0]?.id) {
      console.error("WhatsApp message send failed", { status: messageResponse.status, code: messageResult.error?.code });
      throw new Error("message-send-failed");
    }

    return { accepted: true, messageId: messageResult.messages[0].id };
  } catch (sendError) {
    if (sendError instanceof HttpsError) throw sendError;
    throw new HttpsError("unavailable", "WhatsApp no pudo aceptar el envío. Inténtalo de nuevo más tarde.");
  }
});

