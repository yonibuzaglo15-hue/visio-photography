# Online payment — architecture placeholder (NOT IMPLEMENTED)

Status: **no payment provider is connected and no keys exist in this repo.** The booking confirmation
screen contains a `PAYMENT STEP PLACEHOLDER` comment where the hosted-payment redirect will go.
Owner decision (2026-10-19): payment is charged at the time of ordering; prices are + 18% VAT;
virtual tour ₪40/month + VAT.

## Principles
- The site never collects, sees or stores card data. Card / Apple Pay / Google Pay are entered only on
  the acquirer's **hosted payment page** (HTTPS) → PCI-DSS SAQ-A scope.
- Secret keys live only in Vercel env vars on the server (never `NEXT_PUBLIC_*`, never in git).

## Candidate Israeli providers (to be compared by the owner — verify features/fees with each)
Cardcom (Low Profile page), Tranzila, Grow (Meshulam), PayPlus, Hyp (YaadPay).
Invoices/receipts: the provider's document module, or Morning (Green Invoice) / iCount / EZcount.

## Flow
1. Booking form (consent to terms + privacy recorded: time, `TERMS_VERSION`) → `POST /api/book-appointment`.
2. Server creates a payment request at the provider (amount **incl. 18% VAT**, description, bookingRef,
   success/cancel URLs) → returns the hosted-page URL → client redirects.
3. Before redirect the UI shows: final price incl. VAT, cancellation/refund terms, link to the terms version.
4. Signature package: separate, unchecked checkbox — explicit consent to a ₪40 + VAT monthly charge,
   auto-renewing, cancellable effective end of paid month; provider stores the card token (terms 3.9).
   We store only the provider's token/subscription id.
5. `POST /api/payments/webhook` (to add):
   a. verify HMAC signature with the provider secret (`crypto.timingSafeEqual`), or, if the provider has no
      signatures, re-query the transaction server-to-server;
   b. check amount, currency and bookingRef match;
   c. idempotency by transaction id;
   d. mark booking `paid`, audit-log;
   e. then issue the tax invoice/receipt and email it (terms 3.8).
6. Refunds: admin action → provider refund API to the original method (terms 3.10) + credit note.
7. Env vars to add later (names only): `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`,
   `INVOICE_API_KEY`.
