export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, "_")
      .replace(/-+/g, "-")
      .slice(0, 140) || "download"
  );
}

export function downloadUrl(filename: string, url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadJson(filename: string, data: unknown) {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  );
}

export function downloadCsv(filename: string, rows: string[][]) {
  const content = rows
    .map(row =>
      row.map(cell => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")
    )
    .join("\n");

  downloadBlob(
    filename,
    new Blob([content], { type: "text/csv;charset=utf-8" })
  );
}

export function downloadHtml(filename: string, html: string) {
  downloadBlob(filename, new Blob([html], { type: "text/html;charset=utf-8" }));
}

export function downloadWord(filename: string, html: string) {
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Export</title></head><body>`;
  const footer = "</body></html>";
  const content = header + html + footer;
  downloadBlob(filename, new Blob([content], { type: "application/msword" }));
}
