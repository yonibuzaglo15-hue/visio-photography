const PACKAGES = new Set(["PHOTOS", "PHOTOS_VIDEO", "FULL", "INSTAGRAM"]);

export function cleanText(value, max = 400) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

export function cleanPhone(value) {
  const phone = cleanText(value, 24).replace(/[^\d+\-\s]/g, "");
  if (phone.replace(/\D/g, "").length < 8) return "";
  return phone;
}

export function cleanPackage(value) {
  const pkg = cleanText(value, 32);
  return PACKAGES.has(pkg) ? pkg : "";
}

export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || "local";
}
