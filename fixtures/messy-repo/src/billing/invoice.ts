// Invoice math for the billing subsystem.

export function computeInvoiceTotal(lineItems: number[]): number {
  return lineItems.reduce((sum, n) => sum + n, 0);
}