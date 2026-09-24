/**
 * True on an iPhone or iPad inside an iframe, as on itch.io, where Safari
 * may drop the game's storage (NFR14).
 */
export function isIosIframe(): boolean {
  // iPadOS reports itself as a Mac; only the touch points give it away.
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && window.self !== window.top;
}
