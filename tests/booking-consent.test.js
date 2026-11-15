import { describe, expect, it } from "vitest";
import { OWNER_CONSENT_TEXT, parseBookingConsent } from "../lib/booking-consent.js";

describe("booking consent", () => {
  it("rejects a missing customer type and an unchecked consent box", () => {
    expect(parseBookingConsent({ customerType: "", ownerConsent: "yes" }).ok).toBe(false);
    expect(parseBookingConsent({ customerType: "business", ownerConsent: "" }).ok).toBe(false);
    expect(parseBookingConsent({ customerType: "private", ownerConsent: "no" }).ok).toBe(false);
  });

  it("stores the declaration and a timestamp when both answers are present", () => {
    const parsed = parseBookingConsent({ customerType: "private", ownerConsent: "yes" });
    expect(parsed.ok).toBe(true);
    expect(parsed.customerType).toBe("private");
    expect(parsed.customerTypeLabel).toBe("לקוח פרטי");
    expect(parsed.ownerConsentText).toBe(OWNER_CONSENT_TEXT);
    expect(Number.isFinite(Date.parse(parsed.ownerConsentAt))).toBe(true);
  });
});
