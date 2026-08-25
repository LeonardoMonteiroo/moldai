const SLUG_MAX_LENGTH = 60;

export function slug(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    // #88: neither the pattern name nor a custom chart's size label is
    // bounded before it reaches a filename -- capped before the trim/
    // fallback so a truncation landing on a trailing "-" is cleaned up too.
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  return s || "pattern";
}

export function downloadFile(
  filename: string,
  mime: string,
  data: string | Uint8Array,
): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
