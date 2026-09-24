import { Palette } from "./Palette";
import type { ComponentProps } from "preact";

type Props = ComponentProps<typeof Palette>;

// The DOM overlay layer above the canvas: the palette now, the HUD and menus
// in later tasks.
export function UiRoot(props: Props) {
  return <Palette {...props} />;
}
