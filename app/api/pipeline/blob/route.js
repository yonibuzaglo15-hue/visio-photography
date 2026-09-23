import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { getJob } from "@/lib/pipeline/store.js";

/**
 * Client-side Blob upload token endpoint.
 * Browser → Vercel Blob directly (panoramas 10–20MB+), then /api/pipeline/upload attaches URLs.
 */
export async function POST(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let jobId = null;
        try {
          const payload = clientPayload ? JSON.parse(clientPayload) : {};
          jobId = payload.jobId || null;
        } catch {
          jobId = null;
        }
        if (!jobId) {
          throw new Error("jobId required in clientPayload");
        }
        const job = await getJob(jobId);
        if (!job) {
          throw new Error(`Job not found: ${jobId}`);
        }
        const prefix = `uploads/${jobId}/`;
        if (!pathname.startsWith(prefix)) {
          throw new Error("pathname must be under uploads/{jobId}/");
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
            "application/octet-stream",
          ],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ jobId }),
        };
      },
      onUploadCompleted: async () => {
        // Job attachment happens via POST /api/pipeline/upload with the returned URLs.
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    console.error("[pipeline/blob]", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
