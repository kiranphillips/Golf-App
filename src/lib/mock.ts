// Mock data for the v1 UI. Real data wiring lands in the next iteration.
export const mockUser = {
  id: "self",
  name: "James Donovan",
  initials: "JD",
  handicap: 12.4,
};

export const mockGroup = {
  id: "cypress",
  name: "Cypress Society",
  kicker: "The Fairway Club",
  memberCount: 18,
};

export const mockMembers = [
  { id: "1", name: "Marcus Thorne", initials: "MT", handicap: 6.2 },
  { id: "2", name: "Jameson Blake", initials: "JB", handicap: 9.8 },
  { id: "3", name: "Arthur Ward", initials: "AW", handicap: 4.1 },
  { id: "4", name: "Elias Sterling", initials: "ES", handicap: 14.0 },
  { id: "5", name: "Leo Vance", initials: "LV", handicap: 11.7 },
  { id: "6", name: "Henry Cole", initials: "HC", handicap: 18.2 },
  { id: "7", name: "Oliver Reed", initials: "OR", handicap: 7.5 },
  { id: "self", name: "James Donovan", initials: "JD", handicap: 12.4 },
];

export type RsvpStatus = "in" | "out" | "maybe" | "pending";

export interface TeeTime {
  id: string;
  course: string;
  date: string; // ISO
  format: "Stableford" | "Best Ball" | "Four Ball Alliance" | "Match Play" | "Skins";
  spots: number;
  notes?: string;
  rsvps: Record<string, RsvpStatus>;
}

export const mockTeeTimes: TeeTime[] = [
  {
    id: "tt-1",
    course: "Pine Valley Classic",
    date: "2026-06-06T14:20:00Z",
    format: "Stableford",
    spots: 8,
    notes: "Smart casual. Twilight rate available.",
    rsvps: {
      "1": "in", "2": "in", "3": "in", "4": "maybe",
      "5": "out", "self": "pending", "6": "pending", "7": "in",
    },
  },
  {
    id: "tt-2",
    course: "Whispering Oaks GC",
    date: "2026-06-13T09:10:00Z",
    format: "Four Ball Alliance",
    spots: 12,
    notes: "Two-team format. Best 2 of 4 on par 4s.",
    rsvps: { "1": "in", "2": "in", "3": "maybe", "self": "in" },
  },
  {
    id: "tt-3",
    course: "Hollow Brook Links",
    date: "2026-06-20T11:00:00Z",
    format: "Match Play",
    spots: 4,
    rsvps: { "1": "in", "self": "pending" },
  },
];

export const mockLeaderboard = [
  { id: "1", name: "Marcus Thorne", initials: "MT", points: 142, rounds: 12, delta: 1, wins: 3 },
  { id: "2", name: "Jameson Blake", initials: "JB", points: 138, rounds: 10, delta: 0, wins: 2 },
  { id: "3", name: "Arthur Ward", initials: "AW", points: 124, rounds: 11, delta: 2, wins: 2 },
  { id: "self", name: "James Donovan", initials: "JD", points: 108, rounds: 9, delta: -1, wins: 1 },
  { id: "5", name: "Leo Vance", initials: "LV", points: 96, rounds: 8, delta: 0, wins: 1 },
  { id: "6", name: "Henry Cole", initials: "HC", points: 84, rounds: 7, delta: 1, wins: 0 },
  { id: "7", name: "Oliver Reed", initials: "OR", points: 71, rounds: 6, delta: -2, wins: 0 },
];

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  attending: number;
  courses: number;
}

export const mockTrips: Trip[] = [
  {
    id: "trip-1",
    name: "Annual Spring Trip",
    destination: "St. Andrews Links",
    startDate: "2026-04-12",
    endDate: "2026-04-16",
    attending: 12,
    courses: 3,
  },
  {
    id: "trip-2",
    name: "Cape Coast Invitational",
    destination: "Cabot Cape Breton",
    startDate: "2026-09-04",
    endDate: "2026-09-09",
    attending: 8,
    courses: 2,
  },
];

export const mockMessages = [
  { id: "m1", author: "Marcus Thorne", initials: "MT", body: "Pine Valley confirmed for Saturday. Tee off 14:20.", at: "10:42" },
  { id: "m2", author: "Jameson Blake", initials: "JB", body: "Count me in. Will bring the new wedges.", at: "10:51" },
  { id: "m3", author: "Arthur Ward", initials: "AW", body: "Format is Stableford — full handicaps as usual.", at: "11:05" },
  { id: "m4", author: "James Donovan", initials: "JD", body: "I'll grab a pint after. Same as last week.", at: "11:08", self: true },
];

export function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function formatTimeShort(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function rsvpCounts(rsvps: Record<string, RsvpStatus>) {
  return Object.values(rsvps).reduce(
    (acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { in: 0, out: 0, maybe: 0, pending: 0 } as Record<RsvpStatus, number>,
  );
}
