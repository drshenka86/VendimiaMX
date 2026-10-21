import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export const DEFAULT_RECEIPT_PAYMENT_SETTINGS = Object.freeze({
  banco: "HSBC",
  titular: "GEORGINA GAONA",
  cuenta: "6513342225",
  clabe: "021180065133422253",
  tarjeta: "4213 1661 6722 8034",
  instruccionesPago: "Pago por depósito o transferencia.",
  conceptoPago: "VendimiaMX - {cliente}",
});

const settingsDocument = () => doc(db, "configuracionRecibos", "datosPago");
const previousDefaultConcept = "{cliente} · ID {idVenta}";

function normalizeSettings(settings = {}) {
  const normalizedSettings = Object.fromEntries(Object.keys(DEFAULT_RECEIPT_PAYMENT_SETTINGS).map((key) => [
    key,
    String(settings[key] ?? DEFAULT_RECEIPT_PAYMENT_SETTINGS[key]).trim(),
  ]));
  if (normalizedSettings.conceptoPago === previousDefaultConcept) {
    normalizedSettings.conceptoPago = DEFAULT_RECEIPT_PAYMENT_SETTINGS.conceptoPago;
  }
  return normalizedSettings;
}

export async function loadReceiptPaymentSettings() {
  const snapshot = await getDoc(settingsDocument());
  return normalizeSettings(snapshot.exists() ? snapshot.data() : DEFAULT_RECEIPT_PAYMENT_SETTINGS);
}

export async function saveReceiptPaymentSettings(settings) {
  const normalizedSettings = normalizeSettings(settings);
  await setDoc(settingsDocument(), normalizedSettings);
  return normalizedSettings;
}