/** Saves `content` as a file in the browser, the way a download link would. */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke later: revoking right away can hand the browser an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
