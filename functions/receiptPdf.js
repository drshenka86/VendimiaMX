const fs = require("node:fs");
const path = require("node:path");
const { jsPDF } = require("jspdf");
const autoTableModule = require("jspdf-autotable");
const autoTable = autoTableModule.default || autoTableModule;

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateFormatter = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
const receiptColors = { ink: [24, 43, 61], brand: [23, 63, 88] };
const defaultPaymentSettings = {
  banco: "HSBC",
  titular: "GEORGINA GAONA",
  cuenta: "6513342225",
  clabe: "021180065133422253",
  tarjeta: "4213 1661 6722 8034",
  instruccionesPago: "Pago por depósito o transferencia.",
  conceptoPago: "VendimiaMX - {cliente}",
};

function formatDate(value) {
  const date = value && typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return !value || Number.isNaN(date.getTime()) ? "No especificada" : dateFormatter.format(date);
}

function drawBankDetail(document, label, value, x, y) {
  const labelText = `${label}:`;
  document.setFont("helvetica", "bold");
  document.setFontSize(6.8);
  document.setTextColor(...receiptColors.ink);
  document.text(labelText, x, y);
  const valueX = x + document.getTextWidth(labelText) + 1;
  document.setFont("helvetica", "normal");
  document.text(String(value || ""), valueX, y);
}

function createReceiptPdf({ clientName, sessionId, purchaseDate, status, items, paymentSettings = {} }) {
  if (!items?.length) throw new Error("No hay productos para incluir en el recibo.");

  const settings = { ...defaultPaymentSettings, ...paymentSettings };
  const document = new jsPDF({ unit: "mm", format: "letter" });
  const margin = 15;
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const total = items.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precioUnitario || 0), 0);
  const paid = status === "PAGADOS";
  const logoData = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, "assets", "logo-optimized.png")).toString("base64")}`;

  document.setFillColor(...receiptColors.brand);
  document.rect(0, 0, pageWidth, 29, "F");
  document.setFont("helvetica", "bold");
  document.setFontSize(17);
  document.setTextColor(255, 255, 255);
  document.text("RECIBO DE COMPRA", margin, 20);
  document.addImage(logoData, "PNG", pageWidth - margin - 48, 6, 48, 16);

  const blockWidth = pageWidth - 2 * margin;
  const clientX = margin + 5;
  const dateX = margin + 62;
  const saleIdX = margin + 97;
  const totalX = margin + 145;
  document.setFillColor(246, 249, 251);
  document.setDrawColor(220, 228, 235);
  document.roundedRect(margin, 34, blockWidth, 30, 1.5, 1.5, "FD");
  document.setFillColor(...receiptColors.brand);
  document.rect(margin, 34, 1.2, 30, "F");
  document.setDrawColor(220, 228, 235);
  document.setLineWidth(0.3);
  document.line(margin + 56, 39, margin + 56, 59);
  document.line(margin + 91, 39, margin + 91, 59);
  document.line(margin + 139, 39, margin + 139, 59);

  document.setFont("helvetica", "bold");
  document.setFontSize(7);
  document.setTextColor(105, 119, 130);
  document.text("CLIENTE", clientX, 44);
  document.text("FECHA DE COMPRA", dateX, 44);
  document.text("ID DE VENTA", saleIdX, 44);
  document.text(paid ? "TOTAL PAGADO" : "TOTAL A PAGAR", totalX, 44);

  const safeClientName = String(clientName || "No especificado");
  let clientFontSize = 11;
  document.setFont("helvetica", "bold");
  document.setFontSize(clientFontSize);
  while (clientFontSize > 8 && document.getTextWidth(safeClientName) > 50) {
    clientFontSize -= 0.5;
    document.setFontSize(clientFontSize);
  }
  document.setTextColor(...receiptColors.ink);
  document.text(safeClientName, clientX, 54, { maxWidth: 50 });

  document.setFont("helvetica", "normal");
  document.setFontSize(8.5);
  document.text(formatDate(purchaseDate), dateX, 54, { maxWidth: 29 });
  document.text(String(sessionId || "No especificado"), saleIdX, 54, { maxWidth: 42 });
  document.setFont("helvetica", "bold");
  document.setFontSize(13);
  document.setTextColor(...receiptColors.brand);
  document.text(money.format(total), totalX, 54, { maxWidth: 37 });

  document.setDrawColor(220, 228, 235);
  document.setLineWidth(0.3);
  document.line(margin, 68, pageWidth - margin, 68);
  document.setFont("helvetica", "bold");
  document.setFontSize(11);
  document.setTextColor(...receiptColors.brand);
  document.text("DETALLE DE COMPRA", margin, 76);
  autoTable(document, {
    startY: 81,
    margin: { left: margin, right: margin },
    head: [["CANT.", "DESCRIPCIÓN", "PRECIO UNITARIO", "IMPORTE"]],
    body: items.map((item) => [
      String(item.cantidad),
      `${item.producto || "Producto"}\n${item.codigoProducto || item.idProducto || ""}`,
      money.format(Number(item.precioUnitario || 0)),
      money.format(Number(item.cantidad || 0) * Number(item.precioUnitario || 0)),
    ]),
    foot: [["", "", "TOTAL:", money.format(total)]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, textColor: receiptColors.ink, cellPadding: 2.5, lineColor: [220, 228, 235], lineWidth: 0.2 },
    headStyles: { fillColor: receiptColors.brand, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: receiptColors.brand, textColor: [255, 255, 255], fontStyle: "bold", halign: "right" },
    columnStyles: { 0: { cellWidth: 15, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 36, halign: "right" }, 3: { cellWidth: 32, halign: "right" } },
  });

  let footerY = document.lastAutoTable.finalY + 9;
  if (footerY + 68 > pageHeight - margin) {
    document.addPage();
    footerY = margin;
  }

  const paymentPanelWidth = pageWidth - 2 * margin;
  const bankColumnX = margin + 98;
  document.setFillColor(246, 249, 251);
  document.setDrawColor(220, 228, 235);
  document.roundedRect(margin, footerY + 2, paymentPanelWidth, 48, 1.5, 1.5, "FD");
  document.setFillColor(...receiptColors.brand);
  document.rect(margin, footerY + 2, 1.2, 48, "F");
  document.setFont("helvetica", "bold");
  document.setFontSize(9);
  document.setTextColor(...receiptColors.brand);
  document.text("INFORMACIÓN DE PAGO", margin + 6, footerY + 9);
  document.setDrawColor(220, 228, 235);
  document.setLineWidth(0.3);
  document.line(margin + 5, footerY + 13, pageWidth - margin - 5, footerY + 13);
  document.line(margin + 92, footerY + 17, margin + 92, footerY + 44);

  document.setFont("helvetica", "bold");
  document.setFontSize(7);
  document.setTextColor(105, 119, 130);
  document.text("DATOS BANCARIOS", margin + 6, footerY + 20);
  document.text("FORMA DE PAGO", bankColumnX, footerY + 20);
  drawBankDetail(document, "BANCO", settings.banco, margin + 6, footerY + 26);
  drawBankDetail(document, "TITULAR", settings.titular, margin + 6, footerY + 30.5);
  drawBankDetail(document, "CUENTA", settings.cuenta, margin + 6, footerY + 35);
  drawBankDetail(document, "CLABE", settings.clabe, margin + 6, footerY + 39.5);
  drawBankDetail(document, "TARJETA", settings.tarjeta, margin + 6, footerY + 44);

  document.setFont("helvetica", "normal");
  document.setFontSize(7);
  document.setTextColor(...receiptColors.ink);
  const instructionLines = document.splitTextToSize(String(settings.instruccionesPago), 80);
  document.text(instructionLines, bankColumnX, footerY + 27);
  const conceptLabelY = footerY + 27 + instructionLines.length * 3.5 + 3;
  document.setFont("helvetica", "bold");
  document.text("Concepto de pago:", bankColumnX, conceptLabelY);
  document.setFont("helvetica", "normal");
  const paymentConcept = String(settings.conceptoPago)
    .replaceAll("{cliente}", safeClientName)
    .replaceAll("{idVenta}", String(sessionId || ""));
  document.text(document.splitTextToSize(paymentConcept, 80), bankColumnX, conceptLabelY + 7);

  document.setFont("helvetica", "bold");
  document.setFontSize(7.5);
  document.setTextColor(105, 119, 130);
  document.text("GRACIAS POR TU COMPRA", pageWidth / 2, footerY + 61, { align: "center" });

  const safeSessionId = String(sessionId || "venta").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
  const fileSafeClientName = safeClientName.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
  return {
    buffer: Buffer.from(document.output("arraybuffer")),
    filename: `Recibo_${fileSafeClientName || "cliente"}_${safeSessionId}.pdf`,
    total,
  };
}

module.exports = { createReceiptPdf };