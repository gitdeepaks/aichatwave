const APPROVED_IMAGE_HOSTS = new Set([
  "encrypted-tbn0.gstatic.com",
  "encrypted-tbn1.gstatic.com",
  "encrypted-tbn2.gstatic.com",
  "encrypted-tbn3.gstatic.com",
  "media.zenfs.com",
  "s.yimg.com",
]);

/** Keeps upstream tool data from turning the image optimizer into an open proxy. */
export function approvedRemoteImageUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && APPROVED_IMAGE_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}
