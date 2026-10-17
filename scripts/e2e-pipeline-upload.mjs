import { encode } from "next-auth/jwt";
import { readFileSync } from "fs";
import { put as clientPut } from "@vercel/blob/client";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SECRET = process.env.NEXTAUTH_SECRET;
const EMAIL = (process.env.ALLOWED_EMAILS || "").split(",")[0].trim();

if (!SECRET || !EMAIL) {
  console.error("missing NEXTAUTH_SECRET or ALLOWED_EMAILS");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("missing BLOB_READ_WRITE_TOKEN in env");
  process.exit(1);
}

const cookie =
  "next-auth.session-token=" +
  (await encode({
    token: { email: EMAIL, name: "E2E", sub: "e2e", allowed: true },
    secret: SECRET,
  }));

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      Cookie: cookie,
      ...(opts.body && !(opts.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...opts.headers,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { res, data, text };
}

const created = await api("/api/pipeline/create-job", {
  method: "POST",
  body: JSON.stringify({
    name: "E2E Upload Test",
    phone: "050-0000000",
    address: "Test St 1",
    pkg: "PRESTIGE",
  }),
});
console.log("create", created.res.status, created.data.ok, created.data.job?.id);
if (!created.data.ok) process.exit(1);
const jobId = created.data.job.id;

const listed = await api("/api/pipeline/jobs");
const intake = (listed.data.jobs || []).filter((j) => j.status === "intake");
console.log(
  "list intake",
  intake.length,
  "hasJob",
  intake.some((j) => j.id === jobId)
);
if (!intake.some((j) => j.id === jobId)) process.exit(1);

// Client token generation (same request the browser upload() sends)
const tokenReq = await api("/api/pipeline/blob", {
  method: "POST",
  body: JSON.stringify({
    type: "blob.generate-client-token",
    payload: {
      pathname: `uploads/${jobId}/sample1.jpg`,
      callbackUrl: `${BASE}/api/pipeline/blob`,
      multipart: false,
      clientPayload: JSON.stringify({ jobId }),
    },
  }),
});
console.log("token", tokenReq.res.status, JSON.stringify(tokenReq.data).slice(0, 200));
if (!tokenReq.data?.clientToken) {
  console.error("FAIL no client token", tokenReq.text.slice(0, 500));
  process.exit(1);
}

// Upload bytes with the client token via server put() alternative:
// In browser, upload() does this. Here we put with RW token to same path,
// then also verify clientToken path using put from client with token.
const body1 = readFileSync("/tmp/visio_samples/sample1.jpg");
const body2 = readFileSync("/tmp/visio_samples/sample2.jpg");

const blob1 = await clientPut(`uploads/${jobId}/sample1.jpg`, body1, {
  access: "public",
  token: tokenReq.data.clientToken,
  contentType: "image/jpeg",
});
console.log("put1", blob1.url?.slice(0, 70));

const tokenReq2 = await api("/api/pipeline/blob", {
  method: "POST",
  body: JSON.stringify({
    type: "blob.generate-client-token",
    payload: {
      pathname: `uploads/${jobId}/sample2.jpg`,
      callbackUrl: `${BASE}/api/pipeline/blob`,
      multipart: false,
      clientPayload: JSON.stringify({ jobId }),
    },
  }),
});
const blob2 = await clientPut(`uploads/${jobId}/sample2.jpg`, body2, {
  access: "public",
  token: tokenReq2.data.clientToken,
  contentType: "image/jpeg",
});
console.log("put2", blob2.url?.slice(0, 70));

const attached = await api("/api/pipeline/upload", {
  method: "POST",
  body: JSON.stringify({
    jobId,
    files: [
      { name: "sample1.jpg", url: blob1.url },
      { name: "sample2.jpg", url: blob2.url },
    ],
  }),
});
console.log(
  "attach",
  attached.res.status,
  attached.data.ok,
  "files",
  attached.data.job?.files?.all?.length,
  "status",
  attached.data.job?.status
);
if (!attached.data.ok || (attached.data.job?.files?.all?.length || 0) < 2) {
  console.error(attached.data);
  process.exit(1);
}
console.log("E2E_OK", jobId);
