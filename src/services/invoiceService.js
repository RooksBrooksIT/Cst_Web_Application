import {
  saveStandardDoc,
  updateStandardDoc,
  deleteStandardDoc,
  fetchWithFallback,
  subscribeWithFallback,
} from './firestoreService'

/**
 * Customer Milestone Invoicing & Payment Tracker
 * Complies with Section 3.14 of Architecture Specification
 */

export async function fetchCustomerInvoices(orgId) {
  return fetchWithFallback(orgId, 'customer_invoices')
}

export function subscribeCustomerInvoices(orgId, onData, onError) {
  return subscribeWithFallback(orgId, 'customer_invoices', onData, onError)
}

export async function createCustomerInvoice(orgId, invoiceData) {
  const baseAmount = Number(invoiceData.baseAmount || invoiceData.amount) || 0
  const gstRate = Number(invoiceData.gstRate) || 0.18 // 18% standard GST
  const taxGstAmount = Number(invoiceData.taxGstAmount) || (baseAmount * gstRate)
  const totalPayable = baseAmount + taxGstAmount
  const invoiceNumber = invoiceData.invoiceNumber || `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`

  const payload = {
    invoiceNumber,
    projectId: invoiceData.projectId || invoiceData.siteId || '',
    projectName: invoiceData.projectName || invoiceData.siteName || 'Site',
    customerId: invoiceData.customerId || '',
    customerName: invoiceData.customerName || invoiceData.clientName || 'Valued Customer',
    customerEmail: invoiceData.customerEmail || invoiceData.clientEmail || '',
    customerPhone: invoiceData.customerPhone || invoiceData.clientPhone || '',
    stageId: invoiceData.stageId || 'Milestone Stage',
    stageName: invoiceData.stageName || invoiceData.stage || 'Foundation & Plinth',
    baseAmount,
    taxGstAmount,
    totalPayable,
    amount: totalPayable,
    dueDate: invoiceData.dueDate || new Date(Date.now() + 15 * 86400000).toISOString(),
    status: invoiceData.status || 'issued', // draft, issued, partially_paid, paid, overdue
    payments: Array.isArray(invoiceData.payments) ? invoiceData.payments : [],
    pdfUrl: invoiceData.pdfUrl || '',
    notes: invoiceData.notes || 'Payment terms: Due within 15 days of milestone verification.',
  }

  const docId = await saveStandardDoc(orgId, 'customer_invoices', payload)
  return { id: docId, ...payload }
}

export async function recordCustomerPayment(orgId, invoiceId, paymentData) {
  const paymentEntry = {
    paymentId: `PAY-${Date.now()}`,
    date: paymentData.date || new Date().toISOString(),
    amount: Number(paymentData.amount) || 0,
    method: paymentData.method || 'NEFT', // PayU, NEFT, Cheque, Cash
    transactionRef: paymentData.transactionRef || paymentData.utrNumber || `REF-${Date.now()}`,
    receiptUrl: paymentData.receiptUrl || '',
    status: 'verified',
  }

  await updateStandardDoc(orgId, 'customer_invoices', invoiceId, {
    status: 'paid',
    lastPayment: paymentEntry,
  })
}
