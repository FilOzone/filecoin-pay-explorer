/** Client-side file download via a transient object URL (used for the .env export). */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Deferred: revoking synchronously races the browser's blob fetch (Safari
  // can silently produce an empty download), and this file is a show-once
  // secret — losing it leaves a live authorization with no saved key.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
