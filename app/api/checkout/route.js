import { NextResponse } from "next/server";
import { parseBookingConsent } from "@/lib/booking-consent.js";
import { cleanPackage, cleanText, clientIp } from "@/lib/public-input.js";
import { rateLimit } from "@/lib/rate-limit.js";
import { createGrowCheckout, growConfigured } from "@/lib/payments/grow.js";
import { PACKAGE_PRICES } from "@/lib/payments/prices.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK = "התשלום המקוון ייפתח בקרוב. ניצור איתכם קשר לתיאום התשלום.";

export async function POST(request) {
  if (!rateLimit(`checkout:${clientIp(request)}`)) {
    return NextResponse.json({ success: false, error: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." }, { status: 429 });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (cleanText(body.company_website, 200)) {
    return NextResponse.json({ success: true, available: false, message: FALLBACK });
  }
  const consent = parseBookingConsent(body);
  if (!consent.ok) {
    return NextResponse.json({ success: false, error: consent.error }, { status: 400 });
  }
  const pkg = cleanPackage(body.pkg);
  const amount = PACKAGE_PRICES[pkg];
  if (!amount) {
    return NextResponse.json({ success: false, error: "חבילה לא מוכרת" }, { status: 400 });
  }
  if (!growConfigured()) {
    return NextResponse.json({
      success: true,
      available: false,
      amount,
      vat: "+ מע״מ",
      message: FALLBACK,
    });
  }
  try {
    const origin = new URL(request.url).origin;
    const session = await createGrowCheckout({
      amount,
      pkg,
      orderId: cleanText(body.orderId, 80) || `order-${Date.now()}`,
      successUrl: `${origin}/#booking`,
      cancelUrl: `${origin}/#booking`,
    });
    return NextResponse.json({ success: true, available: true, url: session.url, amount, vat: "+ מע״מ" });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message || FALLBACK }, { status: error.status || 502 });
  }
}
