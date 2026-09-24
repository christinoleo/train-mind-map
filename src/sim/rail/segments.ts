// The rail network as trains see it (FR85, ADR-0005): each rail's double
// track is two directed Segments, one each way, split at the Stations it
// joins. Junctions and crossings, which split them further, come after the
// MVP (Epic 7).

import { NODES } from "../../data/nodes";
import { lineLength, type Point } from "../geometry/planar";
import type { GameState, Leg, Rail, RailEnd, Trip } from "../state/gameState";
import type { NodeId, RailId } from "../state/ids";
import { railPortOf } from "./rails";
import type { RailPort } from "./station";

/** One directed track of a rail, from the Station it leaves to the one it enters. */
export interface Segment {
  /** Its key in the reservation table. */
  key: string;
  rail: RailId;
  /** True for the track from the rail's `from` end to its `to` end. */
  forward: boolean;
  from: RailEnd;
  to: RailEnd;
  /** The centres of its bends, in cells, in the direction of travel. */
  line: Point[];
  /** Its length along `line`, in cells. */
  length: number;
}

/** The reservation key of a rail's track, `forward` or back. */
export function segmentKey(rail: RailId, forward: boolean): string {
  return `segment:${rail}:${forward ? "f" : "b"}`;
}

/** The reservation key of a Station's platform. */
export function platformKey(station: NodeId): string {
  return `platform:${station}`;
}

/** The rail and direction a Segment's reservation key names, if it names one. */
export function parseSegmentKey(
  key: string,
): { rail: RailId; forward: boolean } | null {
  const match = /^segment:(\d+):([fb])$/.exec(key);
  if (!match) return null;
  return { rail: Number(match[1]) as RailId, forward: match[2] === "f" };
}

/** The Station a platform's reservation key names, if it names one. */
export function parsePlatformKey(key: string): NodeId | null {
  const match = /^platform:(\d+)$/.exec(key);
  return match ? (Number(match[1]) as NodeId) : null;
}

const centre = (p: Point): Point => ({ x: p.x + 0.5, y: p.y + 0.5 });

/** The track of `rail` one way, `forward` from its `from` end or back. */
export function segmentOf(
  rail: Readonly<Pick<Rail, "id" | "from" | "to">> & {
    readonly path: readonly Point[];
  },
  forward: boolean,
): Segment {
  const cells = forward ? rail.path : [...rail.path].reverse();
  const line = cells.map(centre);
  return {
    key: segmentKey(rail.id, forward),
    rail: rail.id,
    forward,
    from: forward ? rail.from : rail.to,
    to: forward ? rail.to : rail.from,
    line,
    length: lineLength(line),
  };
}

/** Every Segment of the network, by rail id, forward first. */
function segmentsOf(state: Readonly<GameState>): Segment[] {
  const rails = [...state.rails.values()].sort((a, b) => a.id - b.id);
  return rails.flatMap((rail) => [
    segmentOf(rail, true),
    segmentOf(rail, false),
  ]);
}

/** The rail port a Segment's end is, when its Station still stands. */
function portOf(
  state: Readonly<GameState>,
  end: RailEnd,
): RailPort | undefined {
  return railPortOf(state.nodes.get(end.node), end.port);
}

/**
 * Where a train stops in a Station it enters through `port`: across the
 * card's middle, on the rail port's row.
 */
export function platformPoint(
  station: { kind: "station"; x: number; y: number },
  port: RailPort,
): Point {
  return { x: station.x + NODES.station.size / 2, y: port.cell.y + 0.5 };
}

/**
 * The shortest way over the rails from Station `from` to Station `to`
 * (FR85), as the Segments in order, or `null` when there is none. A train
 * leaves `from` through any rail port, and goes straight through a Station
 * on its way: in at one side, out at the other. It never goes through a
 * Station `avoid` picks. Ties go to the lower rail.
 */
export function findRoute(
  state: Readonly<GameState>,
  from: NodeId,
  to: NodeId,
  avoid: (station: NodeId) => boolean = () => false,
): Segment[] | null {
  if (from === to) return null;
  const segments = segmentsOf(state);
  const n = segments.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  segments.forEach((s, i) => {
    if (s.from.node === from) dist[i] = s.length;
  });
  for (;;) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (
        !done[i] &&
        dist[i] < Infinity &&
        (best < 0 || dist[i] < dist[best])
      ) {
        best = i;
      }
    }
    if (best < 0) return null;
    const s = segments[best];
    if (s.to.node === to) {
      const route: Segment[] = [];
      for (let i = best; i >= 0; i = prev[i]) route.unshift(segments[i]);
      return route;
    }
    done[best] = true;
    const entered = portOf(state, s.to);
    if (!entered || s.to.node === from || avoid(s.to.node)) continue;
    for (let i = 0; i < n; i++) {
      const t = segments[i];
      if (done[i] || t.from.node !== s.to.node) continue;
      if (portOf(state, t.from)?.side === entered.side) continue;
      if (dist[best] + t.length < dist[i]) {
        dist[i] = dist[best] + t.length;
        prev[i] = best;
      }
    }
  }
}

/**
 * The trip a train takes along `route` from its start Station: the line it
 * runs, from the start's platform through every Station on the way to the
 * last one's, and each leg's marks along it. Nothing is reserved yet.
 */
export function buildTrip(
  state: Readonly<GameState>,
  route: readonly Segment[],
): Trip {
  const line: Point[] = [];
  let length = 0;
  const add = (p: Point) => {
    const last = line[line.length - 1];
    if (last) {
      if (last.x === p.x && last.y === p.y) return length;
      length += lineLength([last, p]);
    }
    line.push(p);
    return length;
  };
  const station = (end: RailEnd) => {
    const node = state.nodes.get(end.node);
    const port = portOf(state, end);
    if (node?.kind !== "station" || !port) {
      throw new Error(`no rail port ${end.port} on node ${end.node}`);
    }
    return platformPoint(node, port);
  };
  add(station(route[0].from));
  const legs: Leg[] = [];
  let exit = 0;
  route.forEach((segment, i) => {
    const out = add(segment.line[0]);
    if (i === 0) exit = out;
    else legs[i - 1].exit = out;
    let enter = out;
    for (const p of segment.line.slice(1)) enter = add(p);
    const stop = add(station(segment.to));
    legs.push({
      rail: segment.rail,
      segment: segment.key,
      platform: platformKey(segment.to.node),
      station: segment.to.node,
      enter,
      stop,
      exit: stop,
    });
  });
  return { line, legs, exit };
}

/** A point along a polyline, and the heading there, in radians. */
interface LinePoint {
  x: number;
  y: number;
  angle: number;
}

/**
 * The point `s` cells along `line`. Before its start or past its end it
 * goes on straight along the first or last stretch.
 */
export function pointAlong(line: readonly Point[], s: number): LinePoint {
  if (line.length === 1) return { ...line[0], angle: 0 };
  let start = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = lineLength([a, b]);
    if (s <= start + len || i === line.length - 1) {
      const t = len === 0 ? 0 : (s - start) / len;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    start += len;
  }
  throw new Error("unreachable");
}
