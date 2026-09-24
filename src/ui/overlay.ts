import { render, type ComponentChild } from "preact";

/**
 * Renders a full-screen dialog in a root of its own, apart from the UI tree,
 * so it still renders if that tree is what broke. Returns a function that
 * removes it.
 */
export function showOverlay(vnode: ComponentChild): () => void {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(vnode, root);
  return () => {
    render(null, root);
    root.remove();
  };
}
