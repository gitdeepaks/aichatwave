/**
 * Turning the composer's attachments back into `File` objects for upload.
 *
 * `PromptInput` is a vendored component: it holds each picked file as a
 * `FileUIPart` whose `url` is either a `blob:` URL it created or a `data:` URL
 * it converted on submit, and it never exposes the original `File`. The
 * uploader needs a `File`, so the round trip is unavoidable — but it must be
 * total. An earlier version returned only what it could decode, which meant a
 * file the browser refused to hand back became *no file at all* and the
 * message was sent, successfully and silently, without the attachment the user
 * had watched appear in the composer.
 *
 * Client-safe: no server imports.
 */

export type AttachmentSource = {
  url: string;
  filename?: string | undefined;
  mediaType: string;
};

export class AttachmentReadError extends Error {
  readonly filename: string;

  constructor(filename: string, cause?: unknown) {
    super(`Could not read "${filename}". Try attaching it again.`);
    this.name = "AttachmentReadError";
    this.filename = filename;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Splits a base64 `data:` URL into its media type and payload. */
export function parseDataUrl(url: string): { mediaType: string; base64: string } | null {
  const match = /^data:([^;,]*);base64,(.*)$/s.exec(url);
  const mediaType = match?.[1];
  const base64 = match?.[2];
  if (mediaType === undefined || base64 === undefined) return null;
  return { mediaType, base64 };
}

/**
 * Decodes base64 without `fetch`.
 *
 * Deliberately not `fetch(dataUrl)`, which would be subject to `connect-src`
 * and is a network API being used to parse a string that is already in memory.
 */
export function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

/**
 * Reads one attachment back into a `File`, or throws.
 *
 * Throws rather than returning null so a file that cannot be read stops the
 * send. Sending the message anyway would answer a question about a document
 * the model was never given — the worst of the available outcomes, because it
 * looks like it worked.
 */
export async function toFile(source: AttachmentSource): Promise<File> {
  const filename = source.filename ?? "attachment";

  const dataUrl = parseDataUrl(source.url);
  if (dataUrl !== null) {
    return new File([decodeBase64(dataUrl.base64)], filename, { type: source.mediaType });
  }

  // A `blob:` URL the composer created for a file the user just picked. Reading
  // it needs `blob:` in `connect-src`; see `lib/security/security-headers.ts`.
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Reading the attachment returned ${response.status}.`);
    return new File([await response.blob()], filename, { type: source.mediaType });
  } catch (error) {
    throw new AttachmentReadError(filename, error);
  }
}

/** All of them, or a throw. Never a shorter list than it was given. */
export async function toFiles(sources: AttachmentSource[]): Promise<File[]> {
  return Promise.all(sources.map(toFile));
}
