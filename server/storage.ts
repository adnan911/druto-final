// Preconfigured storage helpers supporting Pinata IPFS & Forge storage
// Uploads via Pinata IPFS API or Forge presigned URL.

import { ENV } from "./_core/env";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/**
 * Upload a file/buffer to Pinata IPFS
 */
export async function uploadToPinata(
  filename: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ cid: string; url: string }> {
  if (!ENV.pinataJwt) {
    throw new Error("PINATA_JWT is not configured in environment variables");
  }

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const formData = new FormData();
  formData.append("file", blob, filename);

  const pinataMetadata = JSON.stringify({
    name: filename,
    keyvalues: {
      platform: "druto-platform",
      uploadedAt: new Date().toISOString(),
    },
  });
  formData.append("pinataMetadata", pinataMetadata);

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.pinataJwt}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Pinata upload failed (${res.status}): ${errorText}`);
  }

  const result = (await res.json()) as { IpfsHash: string; PinSize: number; Timestamp: string };
  const gateway = (ENV.pinataGateway || "https://gateway.pinata.cloud").replace(/\/+$/, "");
  const url = `${gateway}/ipfs/${result.IpfsHash}`;

  return {
    cid: result.IpfsHash,
    url,
  };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const filename = appendHashSuffix(normalizeKey(relKey));

  // 1. If Pinata JWT is available, upload to Pinata IPFS
  if (ENV.pinataJwt) {
    try {
      const pinataRes = await uploadToPinata(filename, data, contentType);
      return { key: pinataRes.cid, url: pinataRes.url };
    } catch (err) {
      console.warn("[Storage] Pinata upload fallback to proxy:", err);
    }
  }

  // 2. If Forge is available
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
    const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
    presignUrl.searchParams.set("path", filename);

    const presignResp = await fetch(presignUrl, {
      headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    });

    if (presignResp.ok) {
      const { url: s3Url } = (await presignResp.json()) as { url: string };
      if (s3Url) {
        const blob =
          typeof data === "string"
            ? new Blob([data], { type: contentType })
            : new Blob([data as any], { type: contentType });

        const uploadResp = await fetch(s3Url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        });

        if (uploadResp.ok) {
          return { key: filename, url: `/manus-storage/${filename}` };
        }
      }
    }
  }

  throw new Error("Storage upload failed: no backend successfully persisted the file");
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}
