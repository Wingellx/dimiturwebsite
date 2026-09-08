/**
 * Browser-side downscaling for reference images.
 *
 * Two reasons this exists rather than uploading the original:
 *
 *  1. Vercel caps a serverless request body at ~4.5MB. Six 10MB photos
 *     straight off a phone would fail the moment the site is deployed, and
 *     would fail with an opaque error at that.
 *  2. A reference image is looked at, not tattooed from. 1600px is more than
 *     enough to see the idea, and it uploads in seconds on mobile data
 *     instead of minutes.
 *
 * HEIC (iPhone default) cannot be decoded by most browsers' canvas, so those
 * fall through unchanged and are handled server-side by size validation.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Leave formats the canvas cannot reliably decode alone.
  if (file.type === "image/heic" || file.type === "image/heif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longestEdge = Math.max(width, height);

    // Already small enough — re-encoding would only lose quality.
    if (longestEdge <= MAX_EDGE && file.size <= 1_500_000) {
      bitmap.close();
      return file;
    }

    const scale = Math.min(1, MAX_EDGE / longestEdge);
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], replaceExtension(file.name, "jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // A failed resize must never block a booking — send the original and let
    // the server's size check decide.
    return file;
  }
}

function replaceExtension(name: string, extension: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  return `${withoutExtension}.${extension}`;
}
