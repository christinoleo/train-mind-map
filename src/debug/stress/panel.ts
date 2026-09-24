import { strings } from "../../ui/strings";
import type { StressResults } from "./metrics";

// The stress test's DOM panel: live metrics, the scene controls and the
// "copiar resultados" button. Plain DOM, since this page has no game UI.

export interface StressSettings {
  items: number;
  trains: number;
  lod: boolean;
}

const ITEM_OPTIONS = [500, 1000, 2000, 5000];
const TRAIN_OPTIONS = [0, 20];

const t = strings.stress;

interface PanelOptions {
  /** Read to highlight the chosen buttons; `onChange` applies a pick. */
  settings: Readonly<StressSettings>;
  onChange<K extends keyof StressSettings>(
    key: K,
    value: StressSettings[K],
  ): void;
  onLoseContext(): void;
  results(): StressResults;
}

export function createPanel(options: PanelOptions) {
  const root = document.createElement("div");
  root.className = "stress-panel";
  const { settings } = options;

  const readout = document.createElement("pre");
  readout.className = "stress-readout";
  const status = document.createElement("div");
  status.className = "stress-status";
  const body = document.createElement("div");

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function choiceRow<K extends keyof StressSettings>(
    label: string,
    key: K,
    values: StressSettings[K][],
    text: (v: StressSettings[K]) => string = String,
  ) {
    const row = document.createElement("div");
    row.className = "stress-row";
    const name = document.createElement("span");
    name.textContent = label;
    row.appendChild(name);
    const buttons = values.map((v) =>
      button(text(v), () => {
        options.onChange(key, v);
        refresh();
      }),
    );
    const refresh = () =>
      buttons.forEach((b, i) =>
        b.classList.toggle("active", values[i] === settings[key]),
      );
    refresh();
    row.append(...buttons);
    return row;
  }

  body.append(
    choiceRow(t.items, "items", ITEM_OPTIONS),
    choiceRow(t.trains, "trains", TRAIN_OPTIONS),
    choiceRow(t.lod, "lod", [true, false], (v) => (v ? t.on : t.off)),
  );

  const output = document.createElement("textarea");
  output.className = "stress-output";
  output.readOnly = true;
  output.hidden = true;

  const actions = document.createElement("div");
  actions.className = "stress-row";
  actions.append(
    button(t.loseContext, options.onLoseContext),
    button(t.copy, () => void copyResults()),
  );
  body.append(actions, status, output);

  const toggle = button(t.hide, () => {
    body.hidden = !body.hidden;
    readout.hidden = body.hidden;
    toggle.textContent = body.hidden ? t.show : t.hide;
  });
  toggle.className = "stress-toggle";

  root.append(toggle, readout, body);
  document.body.appendChild(root);

  // The Clipboard API needs a secure context, and a phone on the LAN loads
  // the page over plain http, so fall back to a selectable text box.
  async function copyResults() {
    const json = JSON.stringify(options.results(), null, 2);
    output.value = json;
    try {
      await navigator.clipboard.writeText(json);
      output.hidden = true;
      status.textContent = t.copied;
    } catch {
      output.hidden = false;
      output.select();
      const copied = document.execCommand("copy");
      status.textContent = copied ? t.copied : t.copyFailed;
    }
  }

  return {
    show(r: StressResults) {
      readout.textContent = [
        `FPS ${r.fps.avg} · 1% low ${r.fps.low1}`,
        `frame ${r.frameMs.avg} ms · p99 ${r.frameMs.p99} ms`,
        `update ${r.updateMs.avg} ms`,
        `heap ${r.heapMb ?? "n/a"} MB`,
        `DPR ${r.devicePixelRatio} · ${r.renderer}`,
        `itens visíveis ${r.visibleItems} · zoom ${r.zoom}`,
      ].join("\n");
    },
    setStatus(key: "contextLost" | "contextRestored") {
      status.textContent = t[key];
    },
  };
}
