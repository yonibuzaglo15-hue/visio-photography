import { PACKAGE_NAMES } from "./prices.js";

/**
 * Grow (Meshulam) adapter. Keys stay on the server:
 * GROW_API_KEY, GROW_USER_ID, GROW_PAGE_CODE, and optional GROW_API_URL.
 */
export function growConfigured() {
  return Boolean(process.env.GROW_API_KEY && process.env.GROW_USER_ID && process.env.GROW_PAGE_CODE);
}

export async function createGrowCheckout({ amount, pkg, orderId, successUrl, cancelUrl }) {
  const endpoint = process.env.GROW_API_URL || "https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess";
  const name = PACKAGE_NAMES[pkg] || "VISIO";
  const body = new URLSearchParams({
    userId: process.env.GROW_USER_ID,
    pageCode: process.env.GROW_PAGE_CODE,
    apiKey: process.env.GROW_API_KEY,
    sum: String(amount),
    description: `${name} + מע״מ`,
    successUrl,
    cancelUrl,
    cField1: orderId,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  const url = data?.data?.url || data?.data?.paymentLink || data?.url;
  if (!response.ok || !url) {
    const error = new Error("לא ניתן לפתוח תשלום");
    error.status = 502;
    throw error;
  }
  return { url };
}
