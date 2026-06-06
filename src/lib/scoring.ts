// Pure scoring engine. Used both client-side (live preview) and conceptually
// mirrored server-side. No DB, no React.

export type GameFormat =
  | "stableford"
  | "stroke"
  | "stroke_play"
  | "best_ball"
  | "four_ball_alliance"
  | "match_play"
  | "skins";

export interface Hole {
  number: number;
  par: number;
  strokeIndex?: number; // 1..18
}

export interface PlayerRound {
  userId: string;
  name: string;
  handicap?: number; // course handicap (whole strokes received)
  teamId?: string;
  scores: Record<number, number | null>; // hole -> strokes
}

// Stableford points (full handicap allowance via SI)
export function stablefordPoints(par: number, strokes: number, strokesReceived = 0) {
  const net = strokes - strokesReceived;
  const diff = par - net;
  if (diff >= 2) return 4 + (diff - 2); // eagle+ scales
  if (diff === 1) return 3; // birdie
  if (diff === 0) return 2; // par
  if (diff === -1) return 1; // bogey
  return 0;
}

// Strokes received on a hole given course handicap & stroke index
export function strokesOnHole(courseHandicap: number, strokeIndex: number) {
  const hcp = Math.max(0, Math.round(courseHandicap));
  if (!strokeIndex || hcp <= 0) return 0;
  const base = Math.floor(hcp / 18);
  const extra = hcp % 18 >= strokeIndex ? 1 : 0;
  return base + extra;
}

export interface RoundResult {
  userId: string;
  name: string;
  gross: number | null;
  net: number | null;
  stableford: number | null;
  position?: number;
  pointsAwarded?: number;
  teamId?: string;
}

const completedScores = (p: PlayerRound) =>
  Object.values(p.scores).filter((s): s is number => typeof s === "number" && s > 0);

function calcPlayer(player: PlayerRound, holes: Hole[]): RoundResult {
  const strokes = completedScores(player);
  if (strokes.length === 0)
    return { userId: player.userId, name: player.name, gross: null, net: null, stableford: null };

  let gross = 0;
  let net = 0;
  let stbl = 0;
  for (const h of holes) {
    const s = player.scores[h.number];
    if (typeof s !== "number" || s <= 0) continue;
    gross += s;
    const received = strokesOnHole(player.handicap ?? 0, h.strokeIndex ?? 0);
    net += s - received;
    stbl += stablefordPoints(h.par, s, received);
  }
  return {
    userId: player.userId,
    name: player.name,
    gross,
    net,
    stableford: stbl,
    teamId: player.teamId,
  };
}

// SEASON POINTS — simple FedEx-style ladder.
// 1st 30, 2nd 24, 3rd 20, 4th 16, then 14,12,10,8,6,5,4,3,2,1,1,1...
const POINTS_LADDER = [30, 24, 20, 16, 14, 12, 10, 8, 6, 5, 4, 3, 2, 1];
const pointsForPosition = (pos: number) =>
  pos <= POINTS_LADDER.length ? POINTS_LADDER[pos - 1] : 1;

function awardPositions<T extends { stableford: number | null; net: number | null }>(
  rows: T[],
  metric: "stableford" | "net",
): (T & { position: number; pointsAwarded: number })[] {
  const sortable = rows.filter((r) => r[metric] !== null);
  const dir = metric === "stableford" ? -1 : 1; // stableford high wins, net low wins
  sortable.sort((a, b) => ((a[metric] as number) - (b[metric] as number)) * dir);
  return rows.map((r) => {
    const pos = sortable.findIndex((s) => s === r) + 1;
    return { ...r, position: pos || 0, pointsAwarded: pos ? pointsForPosition(pos) : 0 };
  });
}

export interface CalcInput {
  format: GameFormat;
  holes: Hole[];
  players: PlayerRound[];
  options?: {
    /** four_ball_alliance: how many of N scores count on each hole, default [2,2,3,3] (par 3/4/5 etc) */
    countingScoresByPar?: Record<number, number>;
  };
}

export interface CalcOutput {
  perPlayer: RoundResult[];
  /** Optional per-team aggregate (best ball / four ball alliance) */
  perTeam?: { teamId: string; total: number; perHole: number[] }[];
  /** Skins per hole (winner userId or null on carry-over/tie) */
  skins?: { hole: number; winnerUserId: string | null; carriedFrom?: number }[];
  /** Match play results per pair: [a, b, "a"|"b"|"halved"] */
  matchPlay?: { a: string; b: string; result: "a" | "b" | "halved"; up: number; thru: number }[];
}

export function calculate(input: CalcInput): CalcOutput {
  const { format, holes, players } = input;
  const perPlayer = players.map((p) => calcPlayer(p, holes));

  if (format === "stableford") {
    return { perPlayer: awardPositions(perPlayer, "stableford") };
  }

  if (format === "stroke" || format === "stroke_play") {
    return { perPlayer: awardPositions(perPlayer, "net") };
  }

  if (format === "best_ball") {
    // Pair players by teamId; per hole take the lower net score per team
    const teams = new Map<string, PlayerRound[]>();
    players.forEach((p) => {
      if (!p.teamId) return;
      teams.set(p.teamId, [...(teams.get(p.teamId) ?? []), p]);
    });
    const perTeam = Array.from(teams.entries()).map(([teamId, members]) => {
      const perHole = holes.map((h) => {
        const nets = members
          .map((m) => {
            const s = m.scores[h.number];
            if (typeof s !== "number" || s <= 0) return null;
            return s - strokesOnHole(m.handicap ?? 0, h.strokeIndex ?? 0);
          })
          .filter((n): n is number => n !== null);
        return nets.length ? Math.min(...nets) : 0;
      });
      return { teamId, total: perHole.reduce((a, b) => a + b, 0), perHole };
    });
    return { perPlayer, perTeam };
  }

  if (format === "four_ball_alliance") {
    const counting = input.options?.countingScoresByPar ?? { 3: 2, 4: 2, 5: 3 };
    const teams = new Map<string, PlayerRound[]>();
    players.forEach((p) => {
      if (!p.teamId) return;
      teams.set(p.teamId, [...(teams.get(p.teamId) ?? []), p]);
    });
    const perTeam = Array.from(teams.entries()).map(([teamId, members]) => {
      const perHole = holes.map((h) => {
        const stbls = members
          .map((m) => {
            const s = m.scores[h.number];
            if (typeof s !== "number" || s <= 0) return null;
            return stablefordPoints(h.par, s, strokesOnHole(m.handicap ?? 0, h.strokeIndex ?? 0));
          })
          .filter((n): n is number => n !== null)
          .sort((a, b) => b - a);
        const take = counting[h.par] ?? 2;
        return stbls.slice(0, take).reduce((a, b) => a + b, 0);
      });
      return { teamId, total: perHole.reduce((a, b) => a + b, 0), perHole };
    });
    return { perPlayer, perTeam };
  }

  if (format === "skins") {
    let carry = 1;
    let carriedFrom: number | undefined = undefined;
    const skins = holes.map((h) => {
      const scored = players
        .map((p) => ({ id: p.userId, s: p.scores[h.number] }))
        .filter((x): x is { id: string; s: number } => typeof x.s === "number" && x.s > 0);
      if (!scored.length) return { hole: h.number, winnerUserId: null };
      const min = Math.min(...scored.map((s) => s.s));
      const winners = scored.filter((s) => s.s === min);
      if (winners.length === 1) {
        const out = { hole: h.number, winnerUserId: winners[0].id, value: carry, carriedFrom };
        carry = 1;
        carriedFrom = undefined;
        return out;
      }
      carriedFrom = carriedFrom ?? h.number;
      carry += 1;
      return { hole: h.number, winnerUserId: null };
    });
    return { perPlayer, skins };
  }

  if (format === "match_play") {
    // Head-to-head per pair using teamId == groupingId, two players per group
    const pairs: { a: PlayerRound; b: PlayerRound }[] = [];
    const grouped = new Map<string, PlayerRound[]>();
    players.forEach((p) => {
      if (!p.teamId) return;
      grouped.set(p.teamId, [...(grouped.get(p.teamId) ?? []), p]);
    });
    grouped.forEach((m) => {
      for (let i = 0; i < m.length - 1; i += 2) pairs.push({ a: m[i], b: m[i + 1] });
    });
    const matchPlay = pairs.map(({ a, b }) => {
      let up = 0;
      let thru = 0;
      for (const h of holes) {
        const as = a.scores[h.number];
        const bs = b.scores[h.number];
        if (typeof as !== "number" || typeof bs !== "number") continue;
        thru = h.number;
        const aNet = as - strokesOnHole(a.handicap ?? 0, h.strokeIndex ?? 0);
        const bNet = bs - strokesOnHole(b.handicap ?? 0, h.strokeIndex ?? 0);
        if (aNet < bNet) up += 1;
        else if (bNet < aNet) up -= 1;
      }
      const result: "a" | "b" | "halved" = up > 0 ? "a" : up < 0 ? "b" : "halved";
      return { a: a.userId, b: b.userId, result, up: Math.abs(up), thru };
    });
    return { perPlayer, matchPlay };
  }

  return { perPlayer };
}

/**
 * WHS Course Handicap formula.
 * courseHandicap = round(handicapIndex × (slopeRating / 113) + (courseRating − par))
 *
 * @param handicapIndex  Player's Handicap Index (e.g. 12.4)
 * @param slopeRating    Tee box Slope Rating (e.g. 125)
 * @param courseRating   Tee box Course Rating (e.g. 71.8)
 * @param par            Total par for the course (typically 72)
 */
export function courseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number,
): number {
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - par));
}

export const FORMAT_LABELS: Record<GameFormat, string> = {
  stableford: "Stableford",
  stroke: "Stroke Play",
  stroke_play: "Stroke Play",
  best_ball: "Best Ball",
  four_ball_alliance: "Four Ball Alliance",
  match_play: "Match Play",
  skins: "Skins",
};
