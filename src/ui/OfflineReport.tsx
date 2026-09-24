import type { Signal } from "@preact/signals";
import { ITEMS, type ItemCounts } from "../data/items";
import type { NodeKind } from "../data/nodes";
import type { Bottleneck } from "../sim/offline/fastForward";
import type { NodeId } from "../sim/state/ids";
import { formatCount, formatDuration } from "./format";
import { strings } from "./strings";

/** What the report shows: the offline report, with the bottleneck's kind. */
export interface OfflineReportView {
  elapsedMs: number;
  produced: ItemCounts;
  bottleneck: (Bottleneck & { kind: NodeKind }) | null;
}

interface Props {
  /** The report, while it shows. */
  report: Signal<OfflineReportView | null>;
  /** Takes the camera to the bottleneck. */
  onBottleneck(node: NodeId): void;
}

/**
 * "Enquanto você esteve fora" (FR124): the items the factory made while the
 * game was closed and its main bottleneck, which a tap jumps to.
 */
export function OfflineReport({ report, onBottleneck }: Props) {
  const view = report.value;
  if (!view) return null;
  const text = strings.offline;
  const produced = ITEMS.filter((item) => (view.produced[item] ?? 0) > 0);
  const close = () => (report.value = null);
  const { bottleneck } = view;
  return (
    <div class="offline-report" role="dialog" aria-label={text.title}>
      <h2>{text.title}</h2>
      <p>
        {text.away}: {formatDuration(view.elapsedMs)}
      </p>
      {produced.length > 0 ? (
        <ul aria-label={text.produced}>
          {produced.map((item) => (
            <li key={item}>
              <span>{strings.items[item]}</span>
              <span>+{formatCount(view.produced[item]!)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{text.nothing}</p>
      )}
      {bottleneck && (
        <button
          type="button"
          class="offline-bottleneck"
          onClick={() => {
            close();
            onBottleneck(bottleneck.node);
          }}
        >
          {text.bottleneck}: {strings.nodes[bottleneck.kind]} (
          {strings.nodeStatus[bottleneck.status]})
        </button>
      )}
      <button type="button" onClick={close}>
        {text.close}
      </button>
    </div>
  );
}
