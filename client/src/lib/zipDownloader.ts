import JSZip from "jszip";
import { saveAs } from "file-saver";

// Package the maintained starter sources, not a second incomplete template.
const starterFiles = import.meta.glob<string>([
  "../../../starter-templates/nextjs/app/**/*.{ts,tsx,css}",
  "../../../starter-templates/nextjs/components/**/*.tsx",
  "../../../starter-templates/nextjs/lib/**/*.{ts,js,json}",
  "../../../starter-templates/nextjs/{package.json,tsconfig.json,next-env.d.ts,README.md,.env.example}",
], { query: "?raw", import: "default", eager: true });

export function buildStarterZip() {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(starterFiles)) {
    zip.file(path.split("starter-templates/nextjs/")[1], content);
  }
  return zip;
}

export function buildSdkZip() {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(starterFiles)) {
    if (path.includes("/lib/druto-sdk/")) zip.file(path.split("/lib/druto-sdk/")[1], content);
  }
  zip.file("README.md", `# Druto SDK

Install this folder locally with npm install ./path/to/druto-sdk.
The package includes JavaScript and TypeScript declarations; no build is required.
Use Druto.paymentIntents.create on your server with your API key.
Use the returned absolute checkoutUrl to redirect the buyer.
Verify the raw webhook body and druto-signature header with:

    const valid = await verifyDrutoWebhook({ payload: rawBody, signature, secret });

Never expose API keys in browser code. Fulfill only after a verified payment event,
and deduplicate event IDs in your database. Arc Testnet USDC only.
`);
  return zip;
}

export async function downloadDrutoSdkZip() {
  saveAs(await buildSdkZip().generateAsync({ type: "blob" }), "druto-sdk.zip");
}

export async function downloadNextJsStarterZip() {
  saveAs(await buildStarterZip().generateAsync({ type: "blob" }), "druto-nextjs-starter.zip");
}
