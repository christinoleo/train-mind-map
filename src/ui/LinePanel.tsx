import type { ReadonlySignal } from "@preact/signals";
import type { Cost } from "../data/nodes";
import {
  DEPARTURE_KINDS,
  DEPARTURE_SECONDS,
  MVP_WAGONS,
  TIMED_DEPARTURES,
  type DepartureCondition,
  type DepartureKind,
} from "../data/rail";
import { PlaceTrain } from "../sim/commands/placeTrain";
import {
  lineThroughput,
  stationRole,
  type LineThroughput,
} from "../sim/rail/lines";
import { trainCost } from "../sim/rail/trains";
import type { FailReason } from "../sim/result";
import type { GameState } from "../sim/state/gameState";
import type { LineId, NodeId } from "../sim/state/ids";
import { Items, Menu, RemoveAction } from "./Menu";
import { strings } from "./strings";

/** What the Line panel shows of the selected Line, published by the UI bridge. */
export interface LinePanelInfo {
  id: LineId;
  stops: {
    station: NodeId;
    /** What its trains do there. */
    role: "load" | "unload" | null;
    condition: DepartureCondition;
  }[];
  throughput: LineThroughput;
  /** What "+ trem" costs, and why it is refused. */
  addTrain: { cost: Cost; refused: FailReason | null };
  /** What removing the Line gives back: all its trains. */
  refund: Cost;
}

/** What the panel shows of Line `id`, or `null` when there is no such Line. */
export function linePanelInfo(
  state: Readonly<GameState>,
  id: LineId,
): LinePanelInfo | null {
  const line = state.lines.get(id);
  if (!line) return null;
  const throughput = lineThroughput(state, line);
  const check = new PlaceTrain(id).validate(state);
  const refund: Record<string, number> = {};
  for (const [item, count] of Object.entries(trainCost(MVP_WAGONS))) {
    refund[item] = count * throughput.trains;
  }
  return {
    id,
    stops: line.stops.map(({ station, condition }) => ({
      station,
      role: stationRole(state, station),
      condition,
    })),
    throughput,
    addTrain: {
      cost: trainCost(MVP_WAGONS),
      refused: check.ok ? null : check.reason,
    },
    refund,
  };
}

/** A number in pt-BR with up to `digits` decimals: 0,85. */
function decimal(n: number, digits: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

interface Props {
  line: ReadonlySignal<LinePanelInfo | null>;
  onCondition(stop: number, condition: DepartureCondition): void;
  onAddTrain(): void;
  /** Takes the Line's last train off; offered while it has more than one. */
  onRemoveTrain(): void;
  onRemove(): void;
  onClose(): void;
}

/**
 * The Line panel (FR140), a bottom sheet: the Line's stops, each with its
 * departure condition, its trains with "+ trem", and its effective
 * throughput (FR97).
 */
export function LinePanel({
  line,
  onCondition,
  onAddTrain,
  onRemoveTrain,
  onRemove,
  onClose,
}: Props) {
  const info = line.value;
  if (!info) return null;
  const text = strings.line;
  const { throughput: t } = info;
  return (
    <Menu
      label={text.title}
      title={
        <>
          {text.title} {info.id}
        </>
      }
      onClose={onClose}
    >
      <ol class="line-stops">
        {info.stops.map((stop, i) => (
          <li key={i} class="line-stop">
            <span>
              {text.station} {stop.station}
              <span class="menu-items">
                {strings.menu.separator}
                {stop.role ? text[stop.role] : text.pass}
              </span>
            </span>
            <ConditionPicker
              condition={stop.condition}
              onChange={(condition) => onCondition(i, condition)}
            />
          </li>
        ))}
      </ol>
      <div class="line-throughput" role="status">
        <span>
          {text.throughput}: {t.measured ? "" : "≈ "}
          {decimal(t.perSecond, 2)} {text.perSecond}
        </span>
        <span class="menu-items">
          {t.roundTrip === null
            ? text.noRoute
            : `${t.perTrip} ${text.perTrip} ÷ ${decimal(t.roundTrip, 0)} ${text.roundTrip} × ${t.trains}`}
          {!t.measured && t.roundTrip !== null && ` (${text.estimated})`}
        </span>
      </div>
      <div class="line-trains">
        <span>
          {text.trains}: {t.trains}
        </span>
        {t.trains > 1 && (
          <button type="button" class="menu-chip" onClick={onRemoveTrain}>
            {text.removeTrain}
          </button>
        )}
        <button
          type="button"
          class="menu-action line-add"
          disabled={info.addTrain.refused !== null}
          onClick={onAddTrain}
        >
          <span>{text.addTrain}</span>
          <Items cost={info.addTrain.cost} />
          {info.addTrain.refused && (
            <span class="menu-refused">
              {strings.reasons[info.addTrain.refused]}
            </span>
          )}
        </button>
      </div>
      <RemoveAction
        label={text.removeLine}
        refund={info.refund}
        onClick={onRemove}
      />
    </Menu>
  );
}

/** A stop's departure condition: its kind, and its time when it waits one. */
function ConditionPicker({
  condition,
  onChange,
}: {
  condition: DepartureCondition;
  onChange(condition: DepartureCondition): void;
}) {
  const text = strings.line;
  const timed = TIMED_DEPARTURES.includes(condition.kind);
  // A kind that waits no time keeps the last time, for when it comes back.
  const seconds = DEPARTURE_SECONDS.includes(
    condition.seconds as (typeof DEPARTURE_SECONDS)[number],
  )
    ? condition.seconds
    : DEPARTURE_SECONDS[0];
  return (
    <span class="line-condition">
      <select
        aria-label={text.departure}
        value={condition.kind}
        onChange={(e) =>
          onChange({
            kind: e.currentTarget.value as DepartureKind,
            seconds,
          })
        }
      >
        {DEPARTURE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {text.conditions[kind]}
          </option>
        ))}
      </select>
      {timed && (
        <select
          aria-label={`${text.departure} (${text.seconds})`}
          value={seconds}
          onChange={(e) =>
            onChange({
              kind: condition.kind,
              seconds: Number(e.currentTarget.value),
            })
          }
        >
          {DEPARTURE_SECONDS.map((s) => (
            <option key={s} value={s}>
              {s} {text.seconds}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

/**
 * The prompt while the first Station of a new Line is picked on the rail
 * layer: tapping another creates the Line.
 */
export function LinePick({
  station,
  onCancel,
}: {
  station: ReadonlySignal<NodeId | null>;
  onCancel(): void;
}) {
  if (station.value === null) return null;
  const text = strings.line;
  return (
    <p class="line-pick" role="status">
      <span>
        {text.station} {station.value}: {text.pick}
      </span>
      <button type="button" class="menu-chip" onClick={onCancel}>
        {text.cancel}
      </button>
    </p>
  );
}
