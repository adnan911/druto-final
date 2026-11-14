/**
 * Return a marketplace-provided HTTP(S) URL for a buyer action.
 * Relative paths are allowed, while protocol-relative and non-HTTP schemes are rejected.
 */
export function safeMarketplaceReturnUrl(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
