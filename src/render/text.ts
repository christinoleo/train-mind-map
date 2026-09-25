import { Text } from "pixi.js";
import { MAX_ZOOM_SCALE } from "../config/constants";
import { PALETTE } from "./theme";

export interface WorldTextStyle {
  fill?: number;
  /** Shrinks the text to fit this width, in world units. */
  maxWidth?: number;
  /** Rings the text in the shadow colour, to read over terrain. */
  outline?: boolean;
}

/**
 * Bold text of `fontSize` world units, rasterised at the largest zoom so it
 * stays sharp when the camera zooms in.
 */
export function worldText(
  label: string,
  fontSize: number,
  { fill = PALETTE.headerText, maxWidth, outline = false }: WorldTextStyle = {},
): Text {
  const scale = MAX_ZOOM_SCALE;
  const text = new Text({
    text: label,
    style: {
      fontFamily: "system-ui, sans-serif",
      fontWeight: "700",
      fontSize: fontSize * scale,
      fill,
      ...(outline && {
        stroke: {
          color: PALETTE.shadow,
          width: fontSize * scale * 0.25,
          join: "round",
        },
      }),
    },
  });
  const fit =
    maxWidth === undefined ? 1 : Math.min(1, maxWidth / (text.width / scale));
  text.scale.set(fit / scale);
  return text;
}

/**
 * Bold outlined text of `fontSize` screen pixels, for labels the caller keeps
 * the same size on screen at any zoom by scaling them by 1 / the camera's.
 */
export function screenText(label: string, fontSize: number): Text {
  return new Text({
    text: label,
    style: {
      fontFamily: "system-ui, sans-serif",
      fontWeight: "700",
      fontSize,
      fill: PALETTE.text,
      stroke: { color: PALETTE.shadow, width: 3, join: "round" },
    },
  });
}
