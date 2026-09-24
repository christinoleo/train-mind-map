/**
 * Copies text that is still being made. Safari allows a clipboard write only
 * within the tap that asked for it, so the write starts at once and takes the
 * text as a promise; elsewhere it waits for the text and writes it.
 */
export async function copyText(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": blob }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}
