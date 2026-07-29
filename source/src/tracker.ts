export type TimeBasis = "server" | "game";
export type QuestCadence = "daily" | "weekly" | "repeatable";
export type EntryKind =
  | "event"
  | "kills"
  | "upvotes-received"
  | "upvotes-given"
  | "untimed"
  | "undefined"
  | "manual";

export type ScheduleSlot = {
  id: string;
  day?: number;
  hour: number;
  minute: number;
  allDay?: boolean;
  label?: string;
};

export type QuestDefinition = {
  id: string;
  name: string;
  cadence: QuestCadence;
  leadership: number;
  sharedGroup?: string;
};

export type EventDefinition = {
  id: string;
  name: string;
  basis: TimeBasis;
  enabled: boolean;
  accent: string;
  schedules: ScheduleSlot[];
  quests: QuestDefinition[];
};

export type PlannedEvent = {
  id: string;
  eventId: string;
  startUtc: string;
  alert: boolean;
  customName?: string;
};

export type QuestCompletion = {
  questId: string;
  questName: string;
  leadership: number;
  completed: boolean;
};

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventName: string;
  startUtc: string;
  loggedUtc: string;
  wasLeader: boolean;
  notes: string;
  quests: QuestCompletion[];
};

export type LeadershipEntry = {
  id: string;
  earnedUtc: string;
  amount: number;
  kind: EntryKind;
  source: string;
  attendanceId?: string;
  sharedGroup?: string;
};

export type HeroCallRecord = {
  id: string;
  completedUtc: string;
};

export type Period = {
  startUtc: string;
  endUtc: string;
};

export type GameSync = {
  syncedUtc: string;
  gameMinutes: number;
  status: string;
};

export type TrackerState = {
  version: 3;
  ign: string;
  winterTime: boolean;
  resetHour: number;
  leadershipGoal: number;
  heroCallGoal: number;
  leadershipPeriod: Period;
  heroCallPeriod: Period;
  events: EventDefinition[];
  plans: PlannedEvent[];
  attendance: AttendanceRecord[];
  entries: LeadershipEntry[];
  heroCalls: HeroCallRecord[];
  undefinedHeroCalls: number;
  gameSync?: GameSync;
  alertsEnabled: boolean;
  alertedKeys: string[];
  compactMode: boolean;
};

export type Occurrence = {
  key: string;
  event: EventDefinition;
  slot: ScheduleSlot;
  startUtc: string;
};

export const STORAGE_KEY = "archeage-command-center-v3";
export const STORAGE_BACKUP_KEY = "archeage-command-center-v3-last-good";
export const BACKUP_FORMAT = "archeage-command-center-backup";
export const APP_VERSION = "1.0.0-web";
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

let serial = 0;
export function uid(prefix = "id") {
  serial += 1;
  return `${prefix}-${Date.now().toString(36)}-${serial.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

const slot = (
  hour: number,
  minute = 0,
  extras: Partial<ScheduleSlot> = {},
): ScheduleSlot => ({ id: uid("slot"), hour, minute, ...extras });

const quest = (
  name: string,
  cadence: QuestCadence,
  leadership: number,
  sharedGroup = "",
): QuestDefinition => ({
  id: uid("quest"),
  name,
  cadence,
  leadership,
  sharedGroup,
});

const event = (
  id: string,
  name: string,
  basis: TimeBasis,
  accent: string,
  schedules: ScheduleSlot[],
  quests: QuestDefinition[],
): EventDefinition => ({
  id,
  name,
  basis,
  accent,
  enabled: true,
  schedules,
  quests,
});

function defaultEvents(): EventDefinition[] {
  return [
    event(
      "lusca",
      "Lusca",
      "server",
      "#50d6c7",
      [slot(20), slot(2)],
      [quest("Lusca daily", "daily", 10)],
    ),
    event(
      "mistmerrow",
      "Mistmerrow",
      "server",
      "#d9a6ff",
      [slot(3), slot(16), slot(21)],
      [
        quest("Mistmerrow daily", "daily", 10),
        quest("Mistmerrow repeatable", "repeatable", 10),
      ],
    ),
    event(
      "halcyona",
      "Halcyona",
      "server",
      "#f3c969",
      [slot(4), slot(10, 30), slot(18, 30)],
      [quest("Halcyona daily", "daily", 10)],
    ),
    event(
      "veroe",
      "Veroe",
      "server",
      "#ff8f70",
      [
        slot(1, 30, { day: 3 }),
        slot(1, 30, { day: 0 }),
        slot(21, 30, { day: 6 }),
        slot(1, 30, { day: 5 }),
        slot(21, 30, { day: 4 }),
      ],
      [quest("Veroe repeatable", "repeatable", 10)],
    ),
    event(
      "abyssal",
      "Abyssal Attack",
      "server",
      "#f16d8d",
      [
        slot(2, 30, { day: 5 }),
        slot(2, 30, { day: 3 }),
        slot(22, 30, { day: 6 }),
      ],
      [quest("Abyssal daily", "daily", 20)],
    ),
    event(
      "ocleera",
      "Ocleera Rift",
      "server",
      "#73a9ff",
      [slot(16, 50), slot(5)],
      [quest("Ocleera daily", "daily", 10)],
    ),
    event(
      "comet",
      "Comet",
      "server",
      "#ffc276",
      [
        slot(3, 5, { day: 2, label: "Golden Ruins" }),
        slot(1, 25, { day: 5, label: "Windscour" }),
        slot(1, 20, { day: 2, label: "Sandeep" }),
        slot(22, 10, { day: 4, label: "Whalesong Harbor" }),
        slot(19, 30, { day: 0, label: "Hellswamp" }),
        slot(15, 30, { day: 6, label: "Reedwind" }),
        slot(2, 55, { day: 6, label: "Perinoor Ruins" }),
      ],
      [quest("Comet", "daily", 10)],
    ),
    event(
      "diamond-shores",
      "Diamond Shores PVP",
      "server",
      "#99df89",
      [slot(6, 0, { day: 6, allDay: true })],
      [quest("Diamond Shores weekly", "weekly", 20)],
    ),
    event(
      "cr",
      "CR",
      "game",
      "#70d6ff",
      [slot(12)],
      [quest("CR / Tony daily", "daily", 10, "cr-tony")],
    ),
    event(
      "gr",
      "GR",
      "game",
      "#a9def9",
      [slot(0)],
      [quest("GR daily", "daily", 10)],
    ),
    event(
      "tony",
      "Tony",
      "game",
      "#89f0c2",
      [slot(18)],
      [quest("CR / Tony daily", "daily", 10, "cr-tony")],
    ),
    event(
      "hero-board",
      "Hero Board",
      "server",
      "#50d6c7",
      [slot(12, 0, { allDay: true })],
      [quest("Turn in 100 mats", "repeatable", 5)],
    ),
  ];
}

export function serverOffsetMs(state: Pick<TrackerState, "winterTime">) {
  return (state.winterTime ? 1 : 2) * 60 * 60 * 1000;
}

export function utcToServerDate(
  utc: string | number | Date,
  state: Pick<TrackerState, "winterTime">,
) {
  const timestamp =
    utc instanceof Date ? utc.getTime() : typeof utc === "string" ? Date.parse(utc) : utc;
  return new Date(timestamp + serverOffsetMs(state));
}

export function serverWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  state: Pick<TrackerState, "winterTime">,
) {
  return new Date(
    Date.UTC(year, month, day, hour, minute) - serverOffsetMs(state),
  );
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function resetKeyAt(
  utc: string | number | Date,
  state: Pick<TrackerState, "winterTime" | "resetHour">,
) {
  const server = utcToServerDate(utc, state);
  if (server.getUTCHours() < state.resetHour) {
    server.setUTCDate(server.getUTCDate() - 1);
  }
  return isoDate(server);
}

export function resetBounds(
  resetKey: string,
  state: Pick<TrackerState, "winterTime" | "resetHour">,
) {
  const [year, month, day] = resetKey.split("-").map(Number);
  const start = serverWallToUtc(
    year,
    month - 1,
    day,
    state.resetHour,
    0,
    state,
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function createDefaultState(_now = new Date()): TrackerState {
  const leadershipPeriod = {
    startUtc: "2026-07-22T04:00:00.000Z",
    endUtc: "2026-08-25T04:10:00.000Z",
  };
  const heroCallPeriod = {
    startUtc: "2026-07-28T04:00:00.000Z",
    endUtc: "2026-08-25T03:59:00.000Z",
  };
  return {
    version: 3,
    ign: "",
    winterTime: false,
    resetHour: 6,
    leadershipGoal: 4000,
    heroCallGoal: 100,
    leadershipPeriod,
    heroCallPeriod,
    events: defaultEvents(),
    plans: [],
    attendance: [],
    entries: [],
    heroCalls: [],
    undefinedHeroCalls: 0,
    alertsEnabled: false,
    alertedKeys: [],
    compactMode: false,
  };
}

export function normalizeState(input: unknown): TrackerState {
  const fallback = createDefaultState();
  if (!isRecord(input)) return fallback;
  const value = input as Partial<TrackerState>;
  const events = Array.isArray(value.events)
    ? value.events
        .filter(isRecord)
        .map((item, eventIndex) => normalizeEvent(item, eventIndex))
    : fallback.events;
  const plans = Array.isArray(value.plans)
    ? value.plans.filter(isRecord).map((item, index) => ({
        id: textId(item.id, `plan-${index}`),
        eventId: textId(item.eventId, ""),
        startUtc: validIso(item.startUtc, new Date().toISOString()),
        alert: item.alert !== false,
        customName:
          typeof item.customName === "string"
            ? item.customName.slice(0, 180)
            : undefined,
      }))
    : [];
  const attendance = Array.isArray(value.attendance)
    ? value.attendance.filter(isRecord).map((item, index) => ({
        id: textId(item.id, `attendance-${index}`),
        eventId: textId(item.eventId, ""),
        eventName:
          typeof item.eventName === "string"
            ? item.eventName.slice(0, 180)
            : "Archived event",
        startUtc: validIso(item.startUtc, new Date().toISOString()),
        loggedUtc: validIso(item.loggedUtc, new Date().toISOString()),
        wasLeader: item.wasLeader === true,
        notes: typeof item.notes === "string" ? item.notes.slice(0, 10_000) : "",
        quests: Array.isArray(item.quests)
          ? item.quests.filter(isRecord).map((questItem, questIndex) => ({
              questId: textId(questItem.questId, `archived-quest-${questIndex}`),
              questName:
                typeof questItem.questName === "string"
                  ? questItem.questName.slice(0, 180)
                  : "Archived quest",
              leadership: finiteInteger(questItem.leadership, 0, -100_000, 100_000),
              completed: questItem.completed === true,
            }))
          : [],
      }))
    : [];
  const validKinds = new Set<EntryKind>([
    "event",
    "kills",
    "upvotes-received",
    "upvotes-given",
    "untimed",
    "undefined",
    "manual",
  ]);
  const entries = Array.isArray(value.entries)
    ? value.entries.filter(isRecord).map((item, index) => ({
        id: textId(item.id, `entry-${index}`),
        earnedUtc: validIso(item.earnedUtc, new Date().toISOString()),
        amount: finiteInteger(item.amount, 0, -1_000_000, 1_000_000),
        kind: validKinds.has(item.kind as EntryKind)
          ? (item.kind as EntryKind)
          : "manual",
        source:
          typeof item.source === "string"
            ? item.source.slice(0, 300)
            : "Imported entry",
        attendanceId:
          typeof item.attendanceId === "string" ? item.attendanceId : undefined,
        sharedGroup:
          typeof item.sharedGroup === "string" ? item.sharedGroup : undefined,
      }))
    : [];
  const heroCalls = Array.isArray(value.heroCalls)
    ? value.heroCalls.filter(isRecord).map((item, index) => ({
        id: textId(item.id, `hero-${index}`),
        completedUtc: validIso(item.completedUtc, new Date().toISOString()),
      }))
    : [];
  const leadershipPeriod = normalizePeriod(
    value.leadershipPeriod,
    fallback.leadershipPeriod,
  );
  const heroCallPeriod = normalizePeriod(
    value.heroCallPeriod,
    fallback.heroCallPeriod,
  );
  const gameSync = isRecord(value.gameSync)
    ? {
        syncedUtc: validIso(value.gameSync.syncedUtc, new Date().toISOString()),
        gameMinutes: finiteInteger(value.gameSync.gameMinutes, 0, 0, 1439),
        status:
          typeof value.gameSync.status === "string"
            ? value.gameSync.status.slice(0, 180)
            : "Imported sync",
      }
    : undefined;
  return {
    version: 3,
    ign: typeof value.ign === "string" ? value.ign.slice(0, 80) : "",
    winterTime: value.winterTime === true,
    resetHour: finiteInteger(value.resetHour, 6, 0, 23),
    leadershipGoal: finiteInteger(value.leadershipGoal, 4000, 1, 1_000_000),
    heroCallGoal: finiteInteger(value.heroCallGoal, 100, 1, 100_000),
    leadershipPeriod,
    heroCallPeriod,
    events,
    plans,
    attendance,
    entries,
    heroCalls,
    undefinedHeroCalls: finiteInteger(
      value.undefinedHeroCalls,
      0,
      0,
      100_000,
    ),
    gameSync,
    alertsEnabled: value.alertsEnabled === true,
    alertedKeys: Array.isArray(value.alertedKeys)
      ? value.alertedKeys
          .filter((item): item is string => typeof item === "string")
          .slice(-2_000)
      : [],
    compactMode: value.compactMode === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function textId(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.slice(0, 180)
    : fallback;
}

function validIso(value: unknown, fallback: string) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

function normalizePeriod(value: unknown, fallback: Period): Period {
  if (!isRecord(value)) return fallback;
  const startUtc = validIso(value.startUtc, fallback.startUtc);
  const endUtc = validIso(value.endUtc, fallback.endUtc);
  return Date.parse(endUtc) > Date.parse(startUtc)
    ? { startUtc, endUtc }
    : fallback;
}

function normalizeEvent(
  value: Record<string, unknown>,
  eventIndex: number,
): EventDefinition {
  const basis: TimeBasis = value.basis === "game" ? "game" : "server";
  const schedules = Array.isArray(value.schedules)
    ? value.schedules.filter(isRecord).map((item, index) => ({
        id: textId(item.id, `slot-${eventIndex}-${index}`),
        day:
          item.day === undefined
            ? undefined
            : finiteInteger(item.day, 0, 0, 6),
        hour: finiteInteger(item.hour, 0, 0, 23),
        minute: finiteInteger(item.minute, 0, 0, 59),
        allDay: item.allDay === true,
        label: typeof item.label === "string" ? item.label.slice(0, 180) : undefined,
      }))
    : [];
  const cadences = new Set<QuestCadence>(["daily", "weekly", "repeatable"]);
  const quests = Array.isArray(value.quests)
    ? value.quests.filter(isRecord).map((item, index) => ({
        id: textId(item.id, `quest-${eventIndex}-${index}`),
        name:
          typeof item.name === "string"
            ? item.name.slice(0, 180)
            : `Quest ${index + 1}`,
        cadence: cadences.has(item.cadence as QuestCadence)
          ? (item.cadence as QuestCadence)
          : "daily",
        leadership: finiteInteger(item.leadership, 0, -100_000, 100_000),
        sharedGroup:
          typeof item.sharedGroup === "string"
            ? item.sharedGroup.slice(0, 180)
            : undefined,
      }))
    : [];
  return {
    id: textId(value.id, `event-${eventIndex}`),
    name:
      typeof value.name === "string"
        ? value.name.slice(0, 180)
        : `Event ${eventIndex + 1}`,
    basis,
    enabled: value.enabled !== false,
    accent:
      typeof value.accent === "string" && /^#[0-9a-f]{6}$/i.test(value.accent)
        ? value.accent
        : "#29b89d",
    schedules,
    quests,
  };
}

export function createBackup(state: TrackerState) {
  return {
    format: BACKUP_FORMAT,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

export function parseBackup(text: string): TrackerState {
  if (text.length > 10_000_000) {
    throw new Error("This backup is too large to import safely.");
  }
  const parsed = JSON.parse(text) as {
    format?: string;
    state?: unknown;
  };
  if (parsed.format !== BACKUP_FORMAT || !parsed.state) {
    throw new Error("This is not an ArcheAge Command Center backup.");
  }
  assertImportShape(parsed.state);
  const state = normalizeState(parsed.state);
  return state;
}

function assertImportShape(input: unknown) {
  if (!isRecord(input)) throw new Error("The backup state is invalid.");
  const arrays = [
    "events",
    "plans",
    "attendance",
    "entries",
    "heroCalls",
  ] as const;
  for (const key of arrays) {
    if (!Array.isArray(input[key])) {
      throw new Error(`The backup is missing ${key}.`);
    }
    if ((input[key] as unknown[]).length > 50_000) {
      throw new Error(`The backup contains too many ${key} records.`);
    }
  }
  const groups = arrays.map((key) => input[key] as unknown[]);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const ids = new Set<string>();
    for (const item of groups[groupIndex]) {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
        throw new Error("The backup contains a record without an ID.");
      }
      if (ids.has(item.id)) {
        throw new Error("The backup contains duplicate record IDs.");
      }
      ids.add(item.id);
    }
  }
  for (const entry of input.entries as unknown[]) {
    if (
      !isRecord(entry) ||
      !Number.isFinite(Number(entry.amount)) ||
      typeof entry.earnedUtc !== "string" ||
      !Number.isFinite(Date.parse(entry.earnedUtc))
    ) {
      throw new Error("The backup contains an invalid leadership entry.");
    }
  }
  for (const definition of input.events as unknown[]) {
    if (
      !isRecord(definition) ||
      !Array.isArray(definition.schedules) ||
      !Array.isArray(definition.quests)
    ) {
      throw new Error("The backup contains an invalid event definition.");
    }
  }
}

function addServerOccurrences(
  result: Occurrence[],
  state: TrackerState,
  definition: EventDefinition,
  slotDef: ScheduleSlot,
  fromMs: number,
  toMs: number,
) {
  const startServer = utcToServerDate(fromMs, state);
  startServer.setUTCDate(startServer.getUTCDate() - 1);
  startServer.setUTCHours(0, 0, 0, 0);
  const endServer = utcToServerDate(toMs, state);
  endServer.setUTCDate(endServer.getUTCDate() + 1);
  endServer.setUTCHours(0, 0, 0, 0);
  for (
    let cursor = new Date(startServer);
    cursor <= endServer;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (slotDef.day !== undefined && cursor.getUTCDay() !== slotDef.day) continue;
    const start = serverWallToUtc(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth(),
      cursor.getUTCDate(),
      slotDef.allDay ? state.resetHour : slotDef.hour,
      slotDef.allDay ? 0 : slotDef.minute,
      state,
    );
    if (start.getTime() >= fromMs && start.getTime() <= toMs) {
      result.push({
        key: `${definition.id}|${start.toISOString()}`,
        event: definition,
        slot: slotDef,
        startUtc: start.toISOString(),
      });
    }
  }
}

function addGameOccurrences(
  result: Occurrence[],
  state: TrackerState,
  definition: EventDefinition,
  slotDef: ScheduleSlot,
  fromMs: number,
  toMs: number,
) {
  if (!state.gameSync) return;
  const syncMs = Date.parse(state.gameSync.syncedUtc);
  const target = slotDef.hour * 60 + slotDef.minute;
  let deltaGame = target - state.gameSync.gameMinutes;
  while (deltaGame < 0) deltaGame += 1440;
  let first = syncMs + (deltaGame / 6) * 60 * 1000;
  const cycle = 240 * 60 * 1000;
  while (first > fromMs) first -= cycle;
  while (first < fromMs) first += cycle;
  for (let cursor = first; cursor <= toMs; cursor += cycle) {
    const start = new Date(cursor);
    result.push({
      key: `${definition.id}|${start.toISOString()}`,
      event: definition,
      slot: slotDef,
      startUtc: start.toISOString(),
    });
  }
}

export function getOccurrences(
  state: TrackerState,
  from: Date,
  to: Date,
): Occurrence[] {
  const result: Occurrence[] = [];
  for (const definition of state.events) {
    if (!definition.enabled) continue;
    for (const slotDef of definition.schedules) {
      if (definition.basis === "server") {
        addServerOccurrences(
          result,
          state,
          definition,
          slotDef,
          from.getTime(),
          to.getTime(),
        );
      } else {
        addGameOccurrences(
          result,
          state,
          definition,
          slotDef,
          from.getTime(),
          to.getTime(),
        );
      }
    }
  }
  return result.sort(
    (a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc),
  );
}

function mondayWeekStartUtc(instant: string, state: TrackerState) {
  const resetKey = resetKeyAt(instant, state);
  const [year, month, day] = resetKey.split("-").map(Number);
  const trackerDay = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (trackerDay.getUTCDay() + 6) % 7;
  return serverWallToUtc(
    year,
    month - 1,
    day - daysSinceMonday,
    state.resetHour,
    0,
    state,
  );
}

export function isQuestAvailable(
  state: TrackerState,
  definition: QuestDefinition,
  eventUtc: string,
) {
  if (definition.cadence === "repeatable") return true;
  const dayKey = resetKeyAt(eventUtc, state);
  const dailyMatch = state.entries.some((entry) => {
    if (entry.kind !== "event" || resetKeyAt(entry.earnedUtc, state) !== dayKey)
      return false;
    return definition.sharedGroup
      ? entry.sharedGroup === definition.sharedGroup
      : entry.source === definition.id;
  });
  if (dailyMatch) return false;
  if (definition.cadence === "weekly") {
    const start = mondayWeekStartUtc(eventUtc, state).getTime();
    const end = start + 7 * 24 * 60 * 60 * 1000;
    return !state.entries.some((entry) => {
      const earned = Date.parse(entry.earnedUtc);
      return (
        entry.kind === "event" &&
        earned >= start &&
        earned < end &&
        (entry.source === definition.id ||
          (!!definition.sharedGroup &&
            entry.sharedGroup === definition.sharedGroup))
      );
    });
  }
  return true;
}

export function availableLeadership(
  state: TrackerState,
  occurrence: Occurrence,
) {
  return occurrence.event.quests
    .filter((item) => isQuestAvailable(state, item, occurrence.startUtc))
    .reduce((sum, item) => sum + item.leadership, 0);
}

export function findPlan(
  state: TrackerState,
  eventId: string,
  startUtc: string,
) {
  const target = Date.parse(startUtc);
  return state.plans.find(
    (item) =>
      item.eventId === eventId &&
      Math.abs(Date.parse(item.startUtc) - target) < 60_000,
  );
}

export function findAttendance(
  state: TrackerState,
  eventId: string,
  startUtc: string,
) {
  const target = Date.parse(startUtc);
  return state.attendance.find(
    (item) =>
      item.eventId === eventId &&
      Math.abs(Date.parse(item.startUtc) - target) < 60_000,
  );
}

export function periodTotal(state: TrackerState) {
  const start = Date.parse(state.leadershipPeriod.startUtc);
  const end = Date.parse(state.leadershipPeriod.endUtc);
  return state.entries
    .filter((entry) => {
      const earned = Date.parse(entry.earnedUtc);
      return earned >= start && earned <= end;
    })
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function periodMetrics(
  current: number,
  goal: number,
  period: Period,
  now = new Date(),
) {
  const start = Date.parse(period.startUtc);
  const end = Date.parse(period.endUtc);
  const elapsed = Math.max(
    1,
    Math.floor((Math.min(now.getTime(), end) - start) / 86_400_000),
  );
  const remaining = Math.max(
    0,
    Math.floor((end - Math.max(now.getTime(), start) + 60_000) / 86_400_000),
  );
  const left = Math.max(0, goal - current);
  return {
    average: current / elapsed,
    needed: remaining ? left / remaining : left,
    remaining,
    left,
    progress: Math.max(0, Math.min(100, (current / Math.max(1, goal)) * 100)),
  };
}

export function currentGameMinutes(state: TrackerState, now = new Date()) {
  if (!state.gameSync) return undefined;
  const elapsedRealMinutes =
    (now.getTime() - Date.parse(state.gameSync.syncedUtc)) / 60_000;
  const minutes =
    state.gameSync.gameMinutes + Math.floor(elapsedRealMinutes * 6);
  return ((minutes % 1440) + 1440) % 1440;
}

export function parseGameTime(payload: string) {
  const pair = payload.match(
    /"(?:hour|hours|h)"\s*:\s*(\d{1,2})[\s\S]*?"(?:minute|minutes|m)"\s*:\s*(\d{1,2})/i,
  );
  const clock =
    pair ??
    payload.match(/(?:"(?:time|tod)"\s*:\s*")?(\d{1,2}):(\d{2})/i);
  if (clock) {
    const hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (hour <= 23 && minute <= 59) return hour * 60 + minute;
  }
  const numeric = payload.match(/"(?:tod|time)"\s*:\s*(\d+(?:\.\d+)?)/i);
  if (numeric) {
    const value = Number(numeric[1]);
    if (value >= 0 && value < 24) {
      return Math.floor(value) * 60 + Math.floor((value % 1) * 60);
    }
    if (value >= 0 && value < 1440) return Math.floor(value);
  }
  throw new Error("The server returned an unknown game-time format.");
}

export function formatClock(totalMinutes: number | undefined) {
  if (totalMinutes === undefined) return "--:--";
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`;
}

export function formatServerTime(utc: string, state: TrackerState) {
  const server = utcToServerDate(utc, state);
  return `${DAY_NAMES[server.getUTCDay()].slice(0, 3)} ${String(
    server.getUTCHours(),
  ).padStart(2, "0")}:${String(server.getUTCMinutes()).padStart(2, "0")} ${
    state.winterTime ? "CET" : "CEST"
  }`;
}

export function toDateTimeLocal(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  return new Date(value).toISOString();
}
