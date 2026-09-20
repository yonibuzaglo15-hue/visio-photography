/**
 * Supabase Storage provider (alternative to Vercel Blob).
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET
 */

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "visio-assets";
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  return { url, key, bucket };
}

export async function uploadBuffer(pathname, buffer, contentType) {
  const { url, key, bucket } = getConfig();
  const objectPath = pathname.replace(/^\//, "");

  const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase storage upload failed: ${res.status} ${text}`);
  }

  return `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
}

export async function uploadText(pathname, text, contentType = "text/plain") {
  return uploadBuffer(pathname, Buffer.from(text, "utf8"), contentType);
}

export async function uploadFromUrl(pathname, sourceUrl) {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return uploadBuffer(pathname, buf, contentType);
}
