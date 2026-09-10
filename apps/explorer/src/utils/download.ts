/** Saves `content` as a file in the browser, the way a download link would. */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // In the document while clicked: some browsers ignore a click on a detached anchor.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later: revoking right away can hand the browser an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
