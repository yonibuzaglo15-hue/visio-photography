export const OWNER_CONSENT_TEXT =
  "בביצוע ההזמנה הלקוח מצהיר ומאשר כי בעל הנכס או המחזיק בו הסכים מראש לצילום, לטיסת רחפן ולשימוש של VISIO בחומרים, כולל ציון אזור הנכס ושם הסוכן, בתיק העבודות ובשיווק";

export const CUSTOMER_TYPES = {
  business: "עוסק",
  private: "לקוח פרטי",
};

function agreed(value) {
  return value === true || value === "yes" || value === "true";
}

/**
 * The consent timestamp is the server's clock at submission.
 * The checkbox must arrive unchecked-by-default and explicitly agreed.
 */
export function parseBookingConsent({ customerType, ownerConsent } = {}) {
  if (customerType !== "business" && customerType !== "private") {
    return { ok: false, error: "יש לבחור אם המזמין עוסק או לקוח פרטי" };
  }
  if (!agreed(ownerConsent)) {
    return { ok: false, error: "יש לאשר את הסכמת בעל הנכס" };
  }
  return {
    ok: true,
    customerType,
    customerTypeLabel: CUSTOMER_TYPES[customerType],
    ownerConsent: true,
    ownerConsentText: OWNER_CONSENT_TEXT,
    ownerConsentAt: new Date().toISOString(),
  };
}
