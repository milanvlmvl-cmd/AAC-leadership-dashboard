"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  APP_VERSION,
  DAY_NAMES,
  STORAGE_BACKUP_KEY,
  STORAGE_KEY,
  availableLeadership,
  createBackup,
  createDefaultState,
  currentGameMinutes,
  findAttendance,
  findPlan,
  formatClock,
  formatServerTime,
  fromDateTimeLocal,
  getOccurrences,
  isQuestAvailable,
  normalizeState,
  parseBackup,
  parseGameTime,
  periodMetrics,
  periodTotal,
  resetBounds,
  resetKeyAt,
  toDateTimeLocal,
  utcToServerDate,
  uid,
  type AttendanceRecord,
  type EntryKind,
  type EventDefinition,
  type LeadershipEntry,
  type Occurrence,
  type PlannedEvent,
  type TrackerState,
} from "./tracker";

type View = "overview" | "calendar" | "history" | "manage";
type Toast = { id: string; message: string; tone?: "good" | "warn" };
type CalendarItem = {
  key: string;
  occurrence?: Occurrence;
  event?: EventDefinition;
  startUtc: string;
  plan?: PlannedEvent;
  attendance?: AttendanceRecord;
};

const NAV: Array<{ id: View; label: string; glyph: string; helper: string }> = [
  { id: "overview", label: "Command center", glyph: "⌂", helper: "Today" },
  { id: "calendar", label: "Raid calendar", glyph: "◇", helper: "Plan" },
  { id: "history", label: "Activity", glyph: "↗", helper: "Review" },
  { id: "manage", label: "Manage", glyph: "⚙", helper: "Configure" },
];

const GAME_TIME_URL =
  import.meta.env.VITE_GAME_TIME_URL?.trim() ||
  "https://aa-classic.com/api/game/tod";

const SOURCE_CONFIG: Array<{
  kind: EntryKind;
  source: string;
  label: string;
  max: number;
  step: number;
  suffix: string;
}> = [
  {
    kind: "kills",
    source: "Hostile faction kills",
    label: "Hostile kills",
    max: 50,
    step: 1,
    suffix: "/ 50",
  },
  {
    kind: "upvotes-given",
    source: "Upvotes given",
    label: "Upvotes given",
    max: 4,
    step: 2,
    suffix: "2 LS each",
  },
  {
    kind: "upvotes-received",
    source: "Upvotes received for prior server day",
    label: "Prior-day upvotes",
    max: 50,
    step: 1,
    suffix: "/ 50",
  },
];

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatLocal(iso: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  }).format(new Date(iso));
}

function relativeTime(iso: string, now: Date, allDay = false) {
  const delta = Date.parse(iso) - now.getTime();
  if (allDay && delta < 0 && delta > -86_400_000) return "All day today";
  const minutes = Math.round(Math.abs(delta) / 60_000);
  if (delta < 0) return `${minutes}m ago`;
  if (minutes < 60) return `in ${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  return `in ${hours}h ${minutes % 60}m`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withBrowserAlertPermission(state: TrackerState) {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return { ...state, alertsEnabled: false };
  }
  return state;
}

function archivedEvent(record: AttendanceRecord): EventDefinition {
  return {
    id: record.eventId,
    name: record.eventName,
    basis: "server",
    enabled: false,
    accent: "#788681",
    schedules: [],
    quests: record.quests.map((item) => ({
      id: item.questId,
      name: item.questName,
      cadence: "repeatable",
      leadership: item.leadership,
    })),
  };
}

function ToneDot({ color }: { color: string }) {
  return <span className="tone-dot" style={{ background: color }} aria-hidden />;
}

function Toggle({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`mini-toggle ${checked ? "is-on" : ""}`}
      aria-pressed={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
    >
      <span>{checked ? "✓" : ""}</span>
    </button>
  );
}

function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-card ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function LeadershipApp() {
  const [state, setState] = useState<TrackerState>(() => createDefaultState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [now, setNow] = useState(() => new Date());
  const [calendarKey, setCalendarKey] = useState("");
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceRecord | null>(
    null,
  );
  const [attendanceEvent, setAttendanceEvent] =
    useState<EventDefinition | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDefinition | null>(null);
  const [planDraftOpen, setPlanDraftOpen] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState<LeadershipEntry | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [undefinedTotal, setUndefinedTotal] = useState(0);
  const [undefinedStart, setUndefinedStart] = useState("");
  const [undefinedEnd, setUndefinedEnd] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const cooldownActiveRef = useRef(false);

  const update = (recipe: (draft: TrackerState) => void) => {
    setState((current) => {
      const draft = clone(current);
      recipe(draft);
      return draft;
    });
  };

  const toast = (message: string, tone: Toast["tone"] = "good") => {
    const item = { id: uid("toast"), message, tone };
    setToasts((current) => [...current, item]);
    window.setTimeout(
      () => setToasts((current) => current.filter((entry) => entry.id !== item.id)),
      3200,
    );
  };

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem(STORAGE_BACKUP_KEY);
      const loaded = withBrowserAlertPermission(
        saved ? normalizeState(JSON.parse(saved)) : createDefaultState(),
      );
      // Hydration intentionally happens after mount so browser data never gets
      // overwritten by the server-rendered default state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(loaded);
      setCalendarKey(resetKeyAt(new Date(), loaded));
      setUndefinedTotal(periodTotal(loaded));
      setUndefinedStart(loaded.leadershipPeriod.startUtc.slice(0, 10));
      setUndefinedEnd(new Date().toISOString().slice(0, 10));
      setOnboarding(!loaded.ign);
    } catch {
      const fresh = createDefaultState();
      setState(fresh);
      setCalendarKey(resetKeyAt(new Date(), fresh));
      setOnboarding(true);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const previous = window.localStorage.getItem(STORAGE_KEY);
      if (previous) window.localStorage.setItem(STORAGE_BACKUP_KEY, previous);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The in-memory tracker remains usable if local storage is unavailable.
    }
  }, [hydrated, state]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const incoming = normalizeState(JSON.parse(event.newValue));
        setState(incoming);
        setCalendarKey((current) => current || resetKeyAt(new Date(), incoming));
      } catch {
        // Ignore malformed writes from another tab and keep this known-good state.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const playBeep = () => {
    const AudioContextCtor =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    oscillator.addEventListener("ended", () => context.close());
  };

  useEffect(() => {
    if (!hydrated || !state.alertsEnabled) return;
    const due = state.plans.filter((plan) => {
      const key = `${plan.id}|${plan.startUtc}`;
      const delta = Date.parse(plan.startUtc) - now.getTime();
      return (
        plan.alert &&
        delta > 0 &&
        delta <= 10 * 60_000 &&
        !state.alertedKeys.includes(key)
      );
    });
    if (!due.length) return;
    playBeep();
    const first = due[0];
    const definition = state.events.find((item) => item.id === first.eventId);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`${definition?.name ?? first.customName ?? "Event"} starts soon`, {
        body: `Starts at ${formatLocal(first.startUtc, {
          weekday: undefined,
          day: undefined,
          month: undefined,
        })} local time`,
      });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => ({
      ...current,
      alertedKeys: [
        ...current.alertedKeys,
        ...due.map((plan) => `${plan.id}|${plan.startUtc}`),
      ].slice(-2_000),
    }));
  }, [
    hydrated,
    now,
    state.alertedKeys,
    state.alertsEnabled,
    state.events,
    state.plans,
  ]);

  const currentResetKey = useMemo(() => resetKeyAt(now, state), [now, state]);
  const total = useMemo(() => periodTotal(state), [state]);
  const metrics = useMemo(
    () => periodMetrics(total, state.leadershipGoal, state.leadershipPeriod, now),
    [now, state, total],
  );
  const gameMinutes = useMemo(() => currentGameMinutes(state, now), [state, now]);
  const serverNow = useMemo(() => utcToServerDate(now, state), [now, state]);

  const upcoming = useMemo(() => {
    const result = getOccurrences(
      state,
      new Date(now.getTime() - 30 * 60_000),
      new Date(now.getTime() + 36 * 60 * 60_000),
    );
    const { start } = resetBounds(currentResetKey, state);
    const currentAllDay = getOccurrences(state, start, now).filter(
      (item) => item.slot.allDay,
    );
    for (const item of currentAllDay) {
      if (!result.some((candidate) => candidate.key === item.key)) result.push(item);
    }
    return result
      .sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))
      .slice(0, state.compactMode ? 7 : 12);
  }, [state, now, currentResetKey]);

  const heroToday = state.heroCalls.filter(
    (call) => resetKeyAt(call.completedUtc, state) === currentResetKey,
  );
  const lastHeroCall = [...heroToday].sort(
    (a, b) => Date.parse(b.completedUtc) - Date.parse(a.completedUtc),
  )[0];
  const cooldownMs = lastHeroCall
    ? Math.max(0, Date.parse(lastHeroCall.completedUtc) + 3_600_000 - now.getTime())
    : 0;
  useEffect(() => {
    const active = cooldownMs > 0;
    if (cooldownActiveRef.current && !active) playBeep();
    cooldownActiveRef.current = active;
  }, [cooldownMs]);
  const heroPeriodTotal = state.heroCalls.filter((call) => {
    const at = Date.parse(call.completedUtc);
    return (
      at >= Date.parse(state.heroCallPeriod.startUtc) &&
      at <= Date.parse(state.heroCallPeriod.endUtc)
    );
  }).length + state.undefinedHeroCalls;
  const heroMetrics = periodMetrics(
    heroPeriodTotal,
    state.heroCallGoal,
    state.heroCallPeriod,
    now,
  );

  const sourceValue = (kind: EntryKind, source: string) =>
    state.entries
      .filter(
        (entry) =>
          entry.kind === kind &&
          entry.source === source &&
          resetKeyAt(entry.earnedUtc, state) === currentResetKey,
      )
      .reduce((sum, entry) => sum + entry.amount, 0);

  const setSourceValue = (
    kind: EntryKind,
    source: string,
    amount: number,
  ) => {
    const normalizedAmount =
      kind === "upvotes-given"
        ? Math.max(0, Math.min(4, Math.round(amount / 2) * 2))
        : Math.max(0, Math.round(amount));
    update((draft) => {
      const existing = draft.entries.find(
        (entry) =>
          entry.kind === kind &&
          entry.source === source &&
          resetKeyAt(entry.earnedUtc, draft) === currentResetKey,
      );
      draft.entries = draft.entries.filter(
        (entry) =>
          !(
            entry.kind === kind &&
            entry.source === source &&
            resetKeyAt(entry.earnedUtc, draft) === currentResetKey
          ),
      );
      if (normalizedAmount > 0) {
        draft.entries.push({
          id: existing?.id ?? uid("entry"),
          earnedUtc: existing?.earnedUtc ?? new Date().toISOString(),
          amount: normalizedAmount,
          kind,
          source,
        });
      }
    });
  };

  const toggleUntimed = (source: string) => {
    const active = sourceValue("untimed", source) > 0;
    setSourceValue("untimed", source, active ? 0 : 20);
    toast(active ? `${source} marked incomplete` : `${source} complete · +20 LS`);
  };

  const togglePlan = (event: EventDefinition, startUtc: string) => {
    const existing = findPlan(state, event.id, startUtc);
    update((draft) => {
      if (existing) {
        draft.plans = draft.plans.filter((item) => item.id !== existing.id);
      } else {
        draft.plans.push({
          id: uid("plan"),
          eventId: event.id,
          startUtc,
          alert: Date.parse(startUtc) > Date.now(),
        });
      }
    });
    toast(existing ? "Removed from your plan" : `${event.name} added to your plan`);
  };

  const removeAttendance = (record: AttendanceRecord) => {
    update((draft) => {
      draft.attendance = draft.attendance.filter((item) => item.id !== record.id);
      draft.entries = draft.entries.filter(
        (entry) => entry.attendanceId !== record.id,
      );
    });
    toast("Attendance and linked leadership removed", "warn");
  };

  const openAttendance = (
    event: EventDefinition,
    startUtc: string,
    existing?: AttendanceRecord,
  ) => {
    const draft: AttendanceRecord = existing
      ? {
          ...clone(existing),
          quests: [
            ...event.quests.map((item) => {
              const historical = existing.quests.find(
                (questItem) => questItem.questId === item.id,
              );
              return (
                historical ?? {
                  questId: item.id,
                  questName: item.name,
                  leadership: item.leadership,
                  completed: false,
                }
              );
            }),
            ...existing.quests.filter(
              (questItem) =>
                !event.quests.some((definition) => definition.id === questItem.questId),
            ),
          ],
        }
      : ({
        id: uid("attendance"),
        eventId: event.id,
        eventName: event.name,
        startUtc,
        loggedUtc: new Date().toISOString(),
        wasLeader: false,
        notes: "",
        quests: event.quests.map((item) => ({
          questId: item.id,
          questName: item.name,
          leadership: item.leadership,
          completed: false,
        })),
      } satisfies AttendanceRecord);
    setAttendanceEvent(event);
    setAttendanceDraft(clone(draft));
  };

  const saveAttendance = () => {
    if (!attendanceDraft || !attendanceEvent) return;
    update((draft) => {
      const record = {
        ...attendanceDraft,
        eventName: attendanceEvent.name,
      };
      draft.entries = draft.entries.filter(
        (entry) => entry.attendanceId !== record.id,
      );
      record.quests = record.quests.map((item) => ({ ...item }));
      for (const completed of record.quests.filter((item) => item.completed)) {
        const definition = attendanceEvent.quests.find(
          (item) => item.id === completed.questId,
        );
        if (
          definition &&
          !isQuestAvailable(draft, definition, record.startUtc)
        ) {
          completed.completed = false;
          continue;
        }
        draft.entries.push({
          id: uid("entry"),
          earnedUtc: record.startUtc,
          amount: completed.leadership,
          kind: "event",
          source: completed.questId,
          attendanceId: record.id,
          sharedGroup: definition?.sharedGroup,
        });
      }
      const index = draft.attendance.findIndex((item) => item.id === record.id);
      if (index >= 0) draft.attendance[index] = record;
      else draft.attendance.push(record);
    });
    toast(
      `${attendanceEvent.name} logged · +${attendanceDraft.quests
        .filter((item) => item.completed)
        .reduce((sum, item) => sum + item.leadership, 0)} LS`,
    );
    setAttendanceDraft(null);
    setAttendanceEvent(null);
  };

  const logHeroCall = () => {
    if (heroToday.length >= 5) return;
    update((draft) => {
      draft.heroCalls.push({ id: uid("hero"), completedUtc: new Date().toISOString() });
    });
    toast(`Hero call ${heroToday.length + 1}/5 logged · cooldown reset`);
  };

  const undoHeroCall = () => {
    if (!lastHeroCall) return;
    update((draft) => {
      draft.heroCalls = draft.heroCalls.filter(
        (item) => item.id !== lastHeroCall.id,
      );
    });
    toast("Latest hero call removed", "warn");
  };

  const syncGameTime = async () => {
    update((draft) => {
      draft.gameSync = {
        syncedUtc: draft.gameSync?.syncedUtc ?? new Date().toISOString(),
        gameMinutes: draft.gameSync?.gameMinutes ?? 0,
        status: "Syncing…",
      };
    });
    try {
      const response = await fetch(GAME_TIME_URL, {
        headers: { Accept: "application/json,text/plain" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.text();
      const minutes = parseGameTime(payload);
      update((draft) => {
        draft.gameSync = {
          syncedUtc: new Date().toISOString(),
          gameMinutes: minutes,
          status: `Synced ${formatClock(minutes)} in-game`,
        };
      });
      toast("In-game clock synchronized");
    } catch {
      update((draft) => {
        if (draft.gameSync) draft.gameSync.status = "Offline · using last sync";
      });
      toast("Could not reach the game clock; using the last sync", "warn");
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    const refresh = () => {
      const lastSync = state.gameSync
        ? Date.parse(state.gameSync.syncedUtc)
        : 0;
      if (!lastSync || Date.now() - lastSync >= 4.5 * 60_000) {
        void syncGameTime();
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 5 * 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
    // The sync lifecycle starts once after browser state has hydrated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const calendarItems = useMemo(() => {
    if (!calendarKey) return [];
    const { start, end } = resetBounds(calendarKey, state);
    const items: CalendarItem[] = getOccurrences(
      state,
      start,
      new Date(end.getTime() - 1),
    ).map((occurrence) => ({
      key: occurrence.key,
      occurrence,
      event: occurrence.event,
      startUtc: occurrence.startUtc,
      plan: findPlan(state, occurrence.event.id, occurrence.startUtc),
      attendance: findAttendance(
        state,
        occurrence.event.id,
        occurrence.startUtc,
      ),
    }));

    for (const plan of state.plans.filter((item) => {
      const time = Date.parse(item.startUtc);
      return time >= start.getTime() && time < end.getTime();
    })) {
      if (items.some((item) => item.plan?.id === plan.id)) continue;
      const definition = state.events.find((item) => item.id === plan.eventId);
      items.push({
        key: `plan-${plan.id}`,
        event: definition,
        startUtc: plan.startUtc,
        plan,
        attendance: definition
          ? findAttendance(state, definition.id, plan.startUtc)
          : undefined,
      });
    }
    for (const attendance of state.attendance.filter((item) => {
      const time = Date.parse(item.startUtc);
      return time >= start.getTime() && time < end.getTime();
    })) {
      if (items.some((item) => item.attendance?.id === attendance.id)) continue;
      const definition = state.events.find(
        (item) => item.id === attendance.eventId,
      );
      items.push({
        key: `attendance-${attendance.id}`,
        event: definition,
        startUtc: attendance.startUtc,
        plan: definition
          ? findPlan(state, definition.id, attendance.startUtc)
          : undefined,
        attendance,
      });
    }
    return items.sort(
      (a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc),
    );
  }, [calendarKey, state]);

  const exportBackup = () => {
    const payload = JSON.stringify(createBackup(state), null, 2);
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `archeage-command-center-${new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replace(/\.\d{3}Z$/, "Z")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Backup exported");
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = withBrowserAlertPermission(
        parseBackup(await file.text()),
      );
      const summary = [
        `${imported.ign || "Unnamed character"}`,
        `${imported.attendance.length} attendance records`,
        `${imported.entries.length} leadership entries`,
        `${imported.plans.length} planned events`,
      ].join("\n• ");
      if (
        !window.confirm(
          `Restore this backup?\n\n• ${summary}\n\nYour current data will be kept as a recovery snapshot.`,
        )
      )
        return;
      window.localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(state));
      setState(imported);
      setCalendarKey(resetKeyAt(new Date(), imported));
      toast("Backup restored");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not import this backup",
        "warn",
      );
    }
  };

  const restoreLastGood = () => {
    try {
      const snapshot = window.localStorage.getItem(STORAGE_BACKUP_KEY);
      if (!snapshot) {
        toast("No recovery snapshot is available yet", "warn");
        return;
      }
      const recovered = withBrowserAlertPermission(
        normalizeState(JSON.parse(snapshot)),
      );
      if (!window.confirm("Restore the previous local save snapshot?")) return;
      setState(recovered);
      setCalendarKey(resetKeyAt(new Date(), recovered));
      toast("Previous local save restored");
    } catch {
      toast("The recovery snapshot could not be read", "warn");
    }
  };

  const requestAlerts = async () => {
    if (state.alertsEnabled) {
      update((draft) => {
        draft.alertsEnabled = false;
      });
      toast("Desktop event alerts turned off", "warn");
      return;
    }
    if (typeof Notification === "undefined") {
      toast("This browser does not support desktop notifications", "warn");
      return;
    }
    if (Notification.permission === "denied") {
      window.alert(
        "Desktop notifications are blocked for this site. Open your browser's site permissions, allow Notifications, then try enabling event alerts again.",
      );
      toast("Allow notifications in your browser settings first", "warn");
      return;
    }
    if (
      Notification.permission === "default" &&
      !window.confirm(
        "Desktop event alerts need notification permission. Select OK, then choose Allow in the browser prompt.",
      )
    ) {
      toast("Event alerts were not enabled", "warn");
      return;
    }
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    update((draft) => {
      draft.alertsEnabled = permission === "granted";
    });
    toast(
      permission === "granted"
        ? "Event alerts enabled"
        : "Notifications remain disabled",
      permission === "granted" ? "good" : "warn",
    );
  };

  const saveEvent = () => {
    if (!eventDraft?.name.trim()) return;
    update((draft) => {
      const index = draft.events.findIndex((item) => item.id === eventDraft.id);
      if (index >= 0) draft.events[index] = eventDraft;
      else draft.events.push(eventDraft);
    });
    toast(`${eventDraft.name} saved`);
    setEventDraft(null);
  };

  const addUndefined = () => {
    const difference = undefinedTotal - total;
    if (!difference) {
      toast("The entered total already matches your ledger", "warn");
      return;
    }
    const start = new Date(`${undefinedStart}T12:00:00`);
    const end = new Date(`${undefinedEnd}T12:00:00`);
    const days = Math.max(
      1,
      Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1,
    );
    const base = Math.trunc(difference / days);
    let remainder = difference - base * days;
    update((draft) => {
      for (let index = 0; index < days; index += 1) {
        const extra = remainder
          ? Math.sign(remainder)
          : 0;
        remainder -= extra;
        const amount = base + extra;
        if (!amount) continue;
        const earned = new Date(start);
        earned.setDate(earned.getDate() + index);
        draft.entries.push({
          id: uid("entry"),
          earnedUtc: earned.toISOString(),
          amount,
          kind: "undefined",
          source: "Undefined pre-tracking allocation",
        });
      }
    });
    toast(`${Math.abs(difference)} LS distributed across ${days} day${days === 1 ? "" : "s"}`);
  };

  if (!hydrated) {
    return (
      <main className="boot-screen">
        <div className="brand-mark">A</div>
        <p>Preparing your command center…</p>
      </main>
    );
  }

  const serverClock = `${String(serverNow.getUTCHours()).padStart(2, "0")}:${String(
    serverNow.getUTCMinutes(),
  ).padStart(2, "0")}`;
  const currentDayBounds = calendarKey
    ? resetBounds(calendarKey, state)
    : resetBounds(currentResetKey, state);
  const periodEnd = new Date(state.leadershipPeriod.endUtc);
  const daysToPeriodEnd = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000),
  );

  return (
    <div className={`app-shell ${state.compactMode ? "compact" : ""}`}>
      <aside className="side-rail">
        <div className="brand-lockup">
          <div className="brand-mark">A</div>
          <div>
            <strong>Command Center</strong>
            <span>ArcheAge Classic</span>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <span className="nav-glyph">{item.glyph}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.helper}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="sync-chip">
            <span className={state.gameSync ? "pulse-dot live" : "pulse-dot"} />
            <div>
              <strong>Game clock</strong>
              <small>{state.gameSync?.status ?? "Not synchronized"}</small>
            </div>
          </div>
          <button type="button" className="text-button" onClick={syncGameTime}>
            Sync now
          </button>
        </div>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(now)}
            </p>
            <h1>
              Welcome back, <button onClick={() => setOnboarding(true)}>{state.ign}</button>
            </h1>
          </div>
          <div className="clock-cluster" aria-label="Current clocks">
            <div>
              <span>Local</span>
              <strong>
                {now.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </strong>
            </div>
            <div>
              <span>{state.winterTime ? "CET" : "CEST"}</span>
              <strong>{serverClock}</strong>
            </div>
            <div>
              <span>In-game</span>
              <strong>{formatClock(gameMinutes)}</strong>
            </div>
          </div>
        </header>

        {view === "overview" && (
          <div className="view-stack">
            <section className="hero-grid">
              <article className="card progress-card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Leadership period</p>
                    <h2>Your {state.leadershipGoal.toLocaleString()} climb</h2>
                  </div>
                  <span className="days-badge">{daysToPeriodEnd} days left</span>
                </div>
                <div className="progress-body">
                  <div
                    className="progress-orbit"
                    style={
                      {
                        "--progress": `${metrics.progress * 3.6}deg`,
                      } as CSSProperties
                    }
                  >
                    <div>
                      <strong>{Math.round(metrics.progress)}%</strong>
                      <span>complete</span>
                    </div>
                  </div>
                  <div className="progress-copy">
                    <strong>
                      {total.toLocaleString()} <span>/ {state.leadershipGoal.toLocaleString()} LS</span>
                    </strong>
                    <p>
                      {metrics.left.toLocaleString()} remaining ·{" "}
                      {formatNumber(metrics.needed)} per full day keeps you on pace.
                    </p>
                    <div className="metric-pair">
                      <div>
                        <span>Your pace</span>
                        <strong>{formatNumber(metrics.average)} LS/day</strong>
                      </div>
                      <div>
                        <span>Target pace</span>
                        <strong>{formatNumber(metrics.needed)} LS/day</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="card sources-card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Other sources</p>
                    <h2>Today’s quick log</h2>
                  </div>
                  <span className="auto-save">Saved instantly</span>
                </div>
                <div className="source-list">
                  {SOURCE_CONFIG.map((source) => {
                    const value = sourceValue(source.kind, source.source);
                    return (
                      <label className="source-row" key={source.kind}>
                        <span>
                          <strong>{source.label}</strong>
                          <small>{source.suffix}</small>
                        </span>
                        <span className="stepper">
                          <button
                            type="button"
                            onClick={() =>
                              setSourceValue(
                                source.kind,
                                source.source,
                                Math.max(0, value - source.step),
                              )
                            }
                            aria-label={`Decrease ${source.label}`}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={source.max}
                            step={source.step}
                            value={value}
                            onChange={(event) =>
                              setSourceValue(
                                source.kind,
                                source.source,
                                Math.max(
                                  0,
                                  Math.min(source.max, Number(event.target.value)),
                                ),
                              )
                            }
                            aria-label={source.label}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSourceValue(
                                source.kind,
                                source.source,
                                Math.min(source.max, value + source.step),
                              )
                            }
                            aria-label={`Increase ${source.label}`}
                          >
                            +
                          </button>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="daily-checks">
                  {["Whalesong Harbor", "Aegis"].map((source) => {
                    const complete = sourceValue("untimed", source) > 0;
                    return (
                      <button
                        type="button"
                        key={source}
                        className={complete ? "daily-check complete" : "daily-check"}
                        onClick={() => toggleUntimed(source)}
                      >
                        <span>{complete ? "✓" : ""}</span>
                        <strong>{source}</strong>
                        <small>+20 LS</small>
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className={`card calls-card ${cooldownMs ? "cooling" : "ready"}`}>
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Hero calls</p>
                    <h2>{heroToday.length} / 5 today</h2>
                  </div>
                  <span className="status-pill">{cooldownMs ? "Cooling" : "Ready"}</span>
                </div>
                <div className="call-visual">
                  <div className="call-pips" aria-label={`${heroToday.length} of 5 hero calls`}>
                    {[0, 1, 2, 3, 4].map((index) => (
                      <span key={index} className={index < heroToday.length ? "filled" : ""}>
                        {index < heroToday.length ? "✓" : index + 1}
                      </span>
                    ))}
                  </div>
                  <div className="cooldown-clock">
                    <span>{cooldownMs ? "Cooldown remaining" : "Your next call is ready"}</span>
                    <strong>
                      {cooldownMs
                        ? `${String(Math.floor(cooldownMs / 60_000)).padStart(
                            2,
                            "0",
                          )}:${String(Math.floor((cooldownMs % 60_000) / 1000)).padStart(
                            2,
                            "0",
                          )}`
                        : "00:00"}
                    </strong>
                  </div>
                </div>
                <div className="call-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={logHeroCall}
                    disabled={heroToday.length >= 5}
                  >
                    {cooldownMs ? "Log & reset cooldown" : "Log hero call"}
                  </button>
                  <button
                    type="button"
                    className="minus-button"
                    onClick={undoHeroCall}
                    disabled={!lastHeroCall}
                    aria-label="Undo latest hero call"
                  >
                    −
                  </button>
                </div>
                <footer>
                  <span>{heroPeriodTotal} / {state.heroCallGoal} this period</span>
                  <span>{formatNumber(heroMetrics.average)} / day average</span>
                  <span>{formatNumber(heroMetrics.needed)} / day needed</span>
                </footer>
              </article>
            </section>

            <section className="card timeline-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Next 36 hours</p>
                  <h2>Event runway</h2>
                  <p>Plan an event for alerts. Mark attendance separately when you go.</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => setView("calendar")}>
                  Open full calendar →
                </button>
              </div>
              <div className="timeline-labels" aria-hidden>
                <span>When</span>
                <span>Event</span>
                <span>Leadership</span>
                <span>Plan</span>
                <span>Went</span>
                <span>Details</span>
              </div>
              <div className="timeline-list">
                {upcoming.map((occurrence) => {
                  const planned = findPlan(state, occurrence.event.id, occurrence.startUtc);
                  const attended = findAttendance(
                    state,
                    occurrence.event.id,
                    occurrence.startUtc,
                  );
                  const potential = availableLeadership(state, occurrence);
                  const questsLocked =
                    occurrence.event.quests.length > 0 && potential === 0;
                  return (
                    <article
                      className={`timeline-row ${attended ? "attended" : ""} ${
                        questsLocked ? "quest-locked" : ""
                      }`}
                      key={occurrence.key}
                    >
                      <div className="event-time">
                        <strong>
                          {occurrence.slot.allDay
                            ? "ALL DAY"
                            : formatLocal(occurrence.startUtc, {
                                weekday: undefined,
                                day: undefined,
                                month: undefined,
                              })}
                        </strong>
                        <span>
                          {relativeTime(
                            occurrence.startUtc,
                            now,
                            occurrence.slot.allDay,
                          )}
                        </span>
                      </div>
                      <div className="event-name">
                        <ToneDot color={occurrence.event.accent} />
                        <div>
                          <strong>{occurrence.event.name}</strong>
                          <span>
                            {occurrence.slot.label ||
                              (occurrence.event.basis === "game"
                                ? `${String(occurrence.slot.hour).padStart(2, "0")}:${String(
                                    occurrence.slot.minute,
                                  ).padStart(2, "0")} in-game`
                                : formatServerTime(occurrence.startUtc, state))}
                          </span>
                        </div>
                      </div>
                      <span className="ls-chip">
                        {potential ? `+${potential} LS` : "Quest used"}
                      </span>
                      <Toggle
                        checked={!!planned}
                        label={`${planned ? "Unplan" : "Plan"} ${occurrence.event.name}`}
                        onChange={() =>
                          togglePlan(occurrence.event, occurrence.startUtc)
                        }
                      />
                      <Toggle
                        checked={!!attended}
                        label={`${attended ? "Remove attendance for" : "Log attendance for"} ${occurrence.event.name}`}
                        onChange={() =>
                          attended
                            ? removeAttendance(attended)
                            : openAttendance(
                                occurrence.event,
                                occurrence.startUtc,
                              )
                        }
                      />
                      <button
                        type="button"
                        className="row-more"
                        aria-label={`Edit ${occurrence.event.name} attendance`}
                        onClick={() =>
                          openAttendance(
                            occurrence.event,
                            occurrence.startUtc,
                            attended,
                          )
                        }
                      >
                        ···
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {view === "calendar" && (
          <div className="view-stack">
            <section className="page-title-row">
              <div>
                <p className="eyebrow">Reset-day calendar</p>
                <h2>Plan the raid, record the reality.</h2>
                <p>
                  Each day runs from {String(state.resetHour).padStart(2, "0")}:00
                  server time. A missed plan stays visible without becoming attendance.
                </p>
              </div>
              <div className="calendar-controls">
                <input
                  type="date"
                  value={calendarKey}
                  onChange={(event) => setCalendarKey(event.target.value)}
                  aria-label="Calendar server day"
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCalendarKey(currentResetKey)}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setPlanDraftOpen(true)}
                >
                  + Add plan
                </button>
              </div>
            </section>

            <section className="calendar-summary">
              <div>
                <span>Reset window</span>
                <strong>
                  {formatLocal(currentDayBounds.start.toISOString())} →{" "}
                  {formatLocal(currentDayBounds.end.toISOString())}
                </strong>
              </div>
              <div>
                <span>Planned</span>
                <strong>{calendarItems.filter((item) => item.plan).length}</strong>
              </div>
              <div>
                <span>Attended</span>
                <strong>{calendarItems.filter((item) => item.attendance).length}</strong>
              </div>
              <div>
                <span>Leadership logged</span>
                <strong>
                  {calendarItems
                    .flatMap((item) => item.attendance?.quests ?? [])
                    .filter((item) => item.completed)
                    .reduce((sum, item) => sum + item.leadership, 0)}{" "}
                  LS
                </strong>
              </div>
            </section>

            <section className="card calendar-card">
              <div className="calendar-table-head" aria-hidden>
                <span>Time & event</span>
                <span>Quest value</span>
                <span>Intend</span>
                <span>Attended</span>
                <span>Notes</span>
              </div>
              <div className="calendar-list">
                {calendarItems.length === 0 && (
                  <div className="empty-state">
                    <strong>No events on this reset day.</strong>
                    <span>Add a custom plan or edit the event schedule.</span>
                  </div>
                )}
                {calendarItems.map((item) => {
                  const event =
                    item.event ??
                    (item.attendance ? archivedEvent(item.attendance) : undefined);
                  const availableValue = item.occurrence
                    ? availableLeadership(state, item.occurrence)
                    : event
                      ? event.quests
                          .filter((quest) =>
                            isQuestAvailable(state, quest, item.startUtc),
                          )
                          .reduce((sum, quest) => sum + quest.leadership, 0)
                      : 0;
                  const value = item.attendance
                    ? item.attendance.quests
                        .filter((quest) => quest.completed)
                        .reduce((sum, quest) => sum + quest.leadership, 0)
                    : availableValue;
                  const questsLocked =
                    !!event && event.quests.length > 0 && availableValue === 0;
                  const missed =
                    !!item.plan &&
                    !item.attendance &&
                    Date.parse(item.startUtc) < now.getTime();
                  return (
                    <article
                      className={`calendar-row ${missed ? "missed" : ""} ${
                        item.attendance ? "attended" : ""
                      } ${questsLocked ? "quest-locked" : ""}`}
                      key={item.key}
                    >
                      <div className="calendar-event">
                        <span className="calendar-time">
                          {item.occurrence?.slot.allDay
                            ? "All day"
                            : formatLocal(item.startUtc, {
                                weekday: undefined,
                                day: undefined,
                                month: undefined,
                              })}
                        </span>
                        <ToneDot color={event?.accent ?? "#94a3b8"} />
                        <div>
                          <strong>
                            {event?.name ??
                              item.attendance?.eventName ??
                              item.plan?.customName ??
                              "Custom event"}
                          </strong>
                          <small>
                            {missed
                              ? "Planned · not attended"
                              : event?.basis === "game"
                                ? "In-game schedule"
                                : formatServerTime(item.startUtc, state)}
                          </small>
                        </div>
                      </div>
                      <span className="ls-chip">
                        {value
                          ? `${value} LS`
                          : questsLocked
                            ? "Quest used"
                            : "—"}
                      </span>
                      <Toggle
                        checked={!!item.plan}
                        label={`Toggle plan for ${event?.name ?? "event"}`}
                        disabled={!event && !item.plan}
                        onChange={() => {
                          if (event) {
                            togglePlan(event, item.startUtc);
                          } else if (item.plan) {
                            update((draft) => {
                              draft.plans = draft.plans.filter(
                                (plan) => plan.id !== item.plan?.id,
                              );
                            });
                            toast("Archived plan removed");
                          }
                        }}
                      />
                      <Toggle
                        checked={!!item.attendance}
                        label={`Toggle attendance for ${event?.name ?? "event"}`}
                        disabled={!event}
                        onChange={() =>
                          event &&
                          (item.attendance
                            ? removeAttendance(item.attendance)
                            : openAttendance(event, item.startUtc))
                        }
                      />
                      <button
                        type="button"
                        className="notes-button"
                        disabled={!event}
                        onClick={() =>
                          event &&
                          openAttendance(event, item.startUtc, item.attendance)
                        }
                      >
                        {item.attendance?.notes
                          ? item.attendance.notes
                          : item.attendance?.wasLeader
                            ? "Raid leader"
                            : "Add details"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {view === "history" && (
          <div className="view-stack">
            <section className="page-title-row">
              <div>
                <p className="eyebrow">Activity ledger</p>
                <h2>Every point has a trail.</h2>
                <p>Review attendance, leadership sources, raid leadership, and notes.</p>
              </div>
              <div className="segmented">
                {["all", "event", "other", "leader"].map((filter) => (
                  <button
                    type="button"
                    key={filter}
                    className={historyFilter === filter ? "active" : ""}
                    onClick={() => setHistoryFilter(filter)}
                  >
                    {filter === "all"
                      ? "Everything"
                      : filter === "event"
                        ? "Events"
                        : filter === "other"
                          ? "Other LS"
                          : "Led"}
                  </button>
                ))}
              </div>
            </section>

            <section className="history-grid">
              <article className="card attendance-history">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Attendance</p>
                    <h2>Raid log</h2>
                  </div>
                  <span className="count-badge">{state.attendance.length}</span>
                </div>
                <div className="history-list">
                  {[...state.attendance]
                    .filter(
                      (item) =>
                        historyFilter === "all" ||
                        historyFilter === "event" ||
                        (historyFilter === "leader" && item.wasLeader),
                    )
                    .sort(
                      (a, b) => Date.parse(b.startUtc) - Date.parse(a.startUtc),
                    )
                    .map((item) => {
                      const definition = state.events.find(
                        (event) => event.id === item.eventId,
                      );
                      const points = item.quests
                        .filter((quest) => quest.completed)
                        .reduce((sum, quest) => sum + quest.leadership, 0);
                      return (
                        <article className="history-item" key={item.id}>
                          <ToneDot color={definition?.accent ?? "#94a3b8"} />
                          <div className="history-main">
                            <strong>{item.eventName}</strong>
                            <span>{formatLocal(item.startUtc)}</span>
                            {item.notes && <p>{item.notes}</p>}
                          </div>
                          <div className="history-meta">
                            {item.wasLeader && <span className="leader-badge">Leader</span>}
                            <strong>+{points} LS</strong>
                          </div>
                          <button
                            type="button"
                            className="row-more"
                            onClick={() =>
                              openAttendance(
                                definition ?? archivedEvent(item),
                                item.startUtc,
                                item,
                              )
                            }
                            aria-label={`Edit ${item.eventName}`}
                          >
                            ···
                          </button>
                        </article>
                      );
                    })}
                  {!state.attendance.length && (
                    <div className="empty-state">
                      <strong>No attendance logged yet.</strong>
                      <span>Use an Attended tick in the command center or calendar.</span>
                    </div>
                  )}
                </div>
              </article>

              <article className="card ledger-history">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Leadership</p>
                    <h2>Source ledger</h2>
                  </div>
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() =>
                      setLedgerDraft({
                        id: uid("entry"),
                        earnedUtc: new Date().toISOString(),
                        amount: 0,
                        kind: "manual",
                        source: "Manual correction",
                      })
                    }
                  >
                    + Manual
                  </button>
                </div>
                <div className="ledger-list">
                  {[...state.entries]
                    .filter((item) => {
                      if (historyFilter === "event") return item.kind === "event";
                      if (historyFilter === "other")
                        return item.kind !== "event";
                      if (historyFilter === "leader") return false;
                      return true;
                    })
                    .sort(
                      (a, b) => Date.parse(b.earnedUtc) - Date.parse(a.earnedUtc),
                    )
                    .map((item) => {
                      const attendance = item.attendanceId
                        ? state.attendance.find(
                            (record) => record.id === item.attendanceId,
                          )
                        : undefined;
                      const sourceLabel =
                        attendance?.quests.find(
                          (quest) => quest.questId === item.source,
                        )?.questName ?? item.source;
                      return (
                        <button
                          type="button"
                          className="ledger-row"
                          key={item.id}
                          onClick={() => setLedgerDraft(clone(item))}
                        >
                          <span className={`source-icon source-${item.kind}`}>
                            {item.kind === "event"
                              ? "E"
                              : item.kind === "undefined"
                                ? "?"
                                : "+"}
                          </span>
                          <span>
                            <strong>{sourceLabel}</strong>
                            <small>{formatLocal(item.earnedUtc)}</small>
                          </span>
                          <strong className={item.amount < 0 ? "negative" : ""}>
                            {item.amount > 0 ? "+" : ""}
                            {item.amount} LS
                          </strong>
                        </button>
                      );
                    })}
                </div>
              </article>
            </section>
          </div>
        )}

        {view === "manage" && (
          <div className="view-stack">
            <section className="page-title-row">
              <div>
                <p className="eyebrow">Control room</p>
                <h2>Make the tracker yours.</h2>
                <p>Adjust periods, rules, events, data portability, and display.</p>
              </div>
              <span className="local-only-badge">Stored only in this browser</span>
            </section>

            <section className="manage-grid">
              <article className="card settings-card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Goals & periods</p>
                    <h2>Current hero cycle</h2>
                  </div>
                </div>
                <div className="cycle-settings">
                  <section className="cycle-group leadership-cycle">
                    <div className="cycle-group-head">
                      <span className="cycle-mark">LS</span>
                      <div>
                        <strong>Leadership period</strong>
                        <small>Set the target first, then define its earning window.</small>
                      </div>
                    </div>
                    <div className="cycle-goal-row">
                      <label>
                        <span>Leadership goal</span>
                        <input
                          type="number"
                          min={1}
                          value={state.leadershipGoal}
                          onChange={(event) =>
                            update((draft) => {
                              draft.leadershipGoal = Number(event.target.value);
                            })
                          }
                        />
                      </label>
                      <div className="cycle-rule">
                        <span>Period rule</span>
                        <strong>Final day + 10 minutes</strong>
                        <small>Allows prior-day upvotes to be counted.</small>
                      </div>
                    </div>
                    <div className="form-grid two cycle-date-grid">
                      <label>
                        <span>Starts</span>
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(state.leadershipPeriod.startUtc)}
                          onChange={(event) =>
                            update((draft) => {
                              draft.leadershipPeriod.startUtc = fromDateTimeLocal(
                                event.target.value,
                              );
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Ends</span>
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(state.leadershipPeriod.endUtc)}
                          onChange={(event) =>
                            update((draft) => {
                              draft.leadershipPeriod.endUtc = fromDateTimeLocal(
                                event.target.value,
                              );
                            })
                          }
                        />
                      </label>
                    </div>
                  </section>

                  <section className="cycle-group hero-call-cycle">
                    <div className="cycle-group-head">
                      <span className="cycle-mark">HC</span>
                      <div>
                        <strong>Hero-call period</strong>
                        <small>Track the goal, carried-in calls, and exact timeframe.</small>
                      </div>
                    </div>
                    <div className="form-grid two cycle-target-grid">
                      <label>
                        <span>Hero-call goal</span>
                        <input
                          type="number"
                          min={1}
                          value={state.heroCallGoal}
                          onChange={(event) =>
                            update((draft) => {
                              draft.heroCallGoal = Number(event.target.value);
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Undefined hero calls</span>
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          value={state.undefinedHeroCalls}
                          onChange={(event) =>
                            update((draft) => {
                              draft.undefinedHeroCalls = Math.max(
                                0,
                                Math.min(
                                  100_000,
                                  Math.round(Number(event.target.value)),
                                ),
                              );
                            })
                          }
                        />
                        <small>Counts without creating dated records.</small>
                      </label>
                    </div>
                    <div className="form-grid two cycle-date-grid">
                      <label>
                        <span>Starts</span>
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(state.heroCallPeriod.startUtc)}
                          onChange={(event) =>
                            update((draft) => {
                              draft.heroCallPeriod.startUtc = fromDateTimeLocal(
                                event.target.value,
                              );
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>Ends</span>
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(state.heroCallPeriod.endUtc)}
                          onChange={(event) =>
                            update((draft) => {
                              draft.heroCallPeriod.endUtc = fromDateTimeLocal(
                                event.target.value,
                              );
                            })
                          }
                        />
                        <small>Use the final minute before reset.</small>
                      </label>
                    </div>
                  </section>
                </div>
              </article>

              <article className="card preferences-card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Time & display</p>
                    <h2>Tracker behavior</h2>
                  </div>
                </div>
                <button
                  type="button"
                  className="preference-row"
                  onClick={() =>
                    update((draft) => {
                      const oldOffsetHours = draft.winterTime ? 1 : 2;
                      draft.winterTime = !draft.winterTime;
                      const newOffsetHours = draft.winterTime ? 1 : 2;
                      const shiftMs =
                        (oldOffsetHours - newOffsetHours) * 60 * 60 * 1000;
                      const nowMs = Date.now();
                      for (const plan of draft.plans) {
                        const definition = draft.events.find(
                          (item) => item.id === plan.eventId,
                        );
                        if (
                          definition?.basis === "server" &&
                          Date.parse(plan.startUtc) > nowMs
                        ) {
                          plan.startUtc = new Date(
                            Date.parse(plan.startUtc) + shiftMs,
                          ).toISOString();
                        }
                      }
                      draft.alertedKeys = [];
                    })
                  }
                >
                  <span>
                    <strong>Winter server time</strong>
                    <small>
                      {state.winterTime
                        ? "CET · UTC+1 active; future server plans follow wall time"
                        : "CEST · UTC+2 active; future server plans follow wall time"}
                    </small>
                  </span>
                  <span className={`switch ${state.winterTime ? "on" : ""}`} />
                </button>
                <label className="preference-row reset-hour-row">
                  <span>
                    <strong>Server-day reset</strong>
                    <small>
                      Events before this hour count toward the previous tracker day.
                    </small>
                  </span>
                  <span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={state.resetHour}
                      onChange={(event) =>
                        update((draft) => {
                          draft.resetHour = Math.max(
                            0,
                            Math.min(23, Number(event.target.value)),
                          );
                        })
                      }
                      aria-label="Server-day reset hour"
                    />
                    <em>:00</em>
                  </span>
                </label>
                <button
                  type="button"
                  className="preference-row"
                  onClick={() =>
                    update((draft) => {
                      draft.compactMode = !draft.compactMode;
                    })
                  }
                >
                  <span>
                    <strong>Compact event runway</strong>
                    <small>Show seven rather than twelve upcoming events.</small>
                  </span>
                  <span className={`switch ${state.compactMode ? "on" : ""}`} />
                </button>
                <button
                  type="button"
                  className="preference-row"
                  onClick={requestAlerts}
                >
                  <span>
                    <strong>Desktop event alerts</strong>
                    <small>
                      Notify ten minutes before planned events. Browser permission
                      is required.
                    </small>
                  </span>
                  <span className={`switch ${state.alertsEnabled ? "on" : ""}`} />
                </button>
                <div className="game-sync-box">
                  <span>
                    <strong>In-game time source</strong>
                    <small>{state.gameSync?.status ?? "No successful sync yet"}</small>
                  </span>
                  <button type="button" onClick={syncGameTime}>
                    Sync
                  </button>
                </div>
              </article>

              <article className="card events-manager">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Event rules</p>
                    <h2>Schedules & quests</h2>
                  </div>
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={() =>
                      setEventDraft({
                        id: uid("event"),
                        name: "New event",
                        basis: "server",
                        enabled: true,
                        accent: "#50d6c7",
                        schedules: [
                          {
                            id: uid("slot"),
                            hour: 12,
                            minute: 0,
                          },
                        ],
                        quests: [
                          {
                            id: uid("quest"),
                            name: "New quest",
                            cadence: "daily",
                            leadership: 10,
                            sharedGroup: "",
                          },
                        ],
                      })
                    }
                  >
                    + Event
                  </button>
                </div>
                <div className="event-manager-list">
                  {state.events.map((item) => (
                    <button
                      type="button"
                      className="event-manager-row"
                      key={item.id}
                      onClick={() => setEventDraft(clone(item))}
                    >
                      <ToneDot color={item.accent} />
                      <span className="event-manager-main">
                        <strong>{item.name}</strong>
                        <small>
                          {item.schedules.length} time
                          {item.schedules.length === 1 ? "" : "s"} ·{" "}
                          {item.quests
                            .reduce((sum, quest) => sum + quest.leadership, 0)}
                          {" LS potential · "}
                          {item.basis === "server" ? "Server time" : "In-game"}
                        </small>
                      </span>
                      <span className={item.enabled ? "enabled-chip" : "disabled-chip"}>
                        {item.enabled ? "Active" : "Hidden"}
                      </span>
                      <span>›</span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="card undefined-card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Catch-up tool</p>
                    <h2>Undefined leadership</h2>
                  </div>
                </div>
                <p>
                  Match the in-game total and distribute the untracked difference
                  evenly over a date range.
                </p>
                <label>
                  <span>Current in-game leadership</span>
                  <input
                    type="number"
                    min={0}
                    value={undefinedTotal}
                    onChange={(event) => setUndefinedTotal(Number(event.target.value))}
                  />
                </label>
                <div className="form-grid two">
                  <label>
                    <span>Spread from</span>
                    <input
                      type="date"
                      value={undefinedStart}
                      onChange={(event) => setUndefinedStart(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Through</span>
                    <input
                      type="date"
                      value={undefinedEnd}
                      onChange={(event) => setUndefinedEnd(event.target.value)}
                    />
                  </label>
                </div>
                <button type="button" className="secondary-button full" onClick={addUndefined}>
                  Apply difference
                </button>
              </article>

              <article className="card backup-card">
                <div className="card-head">
                  <div>
                    <p className="eyebrow">Local data</p>
                    <h2>Backup & restore</h2>
                  </div>
                  <span className="version-chip">Web {APP_VERSION}</span>
                </div>
                <p>
                  Your progress never leaves this browser unless you export it.
                  Keep a backup before clearing browser data or changing devices.
                </p>
                <div className="backup-actions">
                  <button type="button" className="primary-button" onClick={exportBackup}>
                    Export backup
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => importRef.current?.click()}
                  >
                    Import backup
                  </button>
                  <button
                    type="button"
                    className="text-button recovery-button"
                    onClick={restoreLastGood}
                  >
                    Recover previous save
                  </button>
                  <input
                    ref={importRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={importBackup}
                    hidden
                  />
                </div>
                <div className="data-facts">
                  <span>{state.attendance.length} attendance records</span>
                  <span>{state.entries.length} ledger entries</span>
                  <span>{state.plans.length} planned events</span>
                </div>
                <button
                  type="button"
                  className="danger-text"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Reset all web-app data? Export a backup first if you need it.",
                      )
                    )
                      return;
                    const fresh = createDefaultState();
                    setState(fresh);
                    setOnboarding(true);
                    setCalendarKey(resetKeyAt(new Date(), fresh));
                  }}
                >
                  Reset all browser data
                </button>
              </article>
            </section>
          </div>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
            <span>{item.glyph}</span>
            {item.helper}
          </button>
        ))}
      </nav>

      {attendanceDraft && attendanceEvent && (
        <Modal
          title={attendanceEvent.name}
          eyebrow={`${formatLocal(attendanceDraft.startUtc)} · ${formatServerTime(
            attendanceDraft.startUtc,
            state,
          )}`}
          onClose={() => {
            setAttendanceDraft(null);
            setAttendanceEvent(null);
          }}
        >
          <div className="modal-body">
            <div className="modal-section">
              <p className="eyebrow">Quests completed</p>
              <div className="quest-check-list">
                {attendanceDraft.quests.map((item, index) => {
                  const definition = attendanceEvent.quests.find(
                    (questItem) => questItem.id === item.questId,
                  );
                  const comparisonState = {
                    ...state,
                    entries: state.entries.filter(
                      (entry) => entry.attendanceId !== attendanceDraft.id,
                    ),
                  };
                  const unavailable =
                    !item.completed &&
                    !!definition &&
                    !isQuestAvailable(
                      comparisonState,
                      definition,
                      attendanceDraft.startUtc,
                    );
                  return (
                    <button
                      type="button"
                      key={item.questId}
                      className={item.completed ? "quest-check checked" : "quest-check"}
                      disabled={unavailable}
                      onClick={() =>
                        setAttendanceDraft((current) => {
                          if (!current) return current;
                          const next = clone(current);
                          next.quests[index].completed = !next.quests[index].completed;
                          return next;
                        })
                      }
                    >
                      <span>{item.completed ? "✓" : ""}</span>
                      <strong>{item.questName}</strong>
                      <small>
                        {unavailable
                          ? "Already completed in this lockout"
                          : `+${item.leadership} LS`}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="leader-check">
              <input
                type="checkbox"
                checked={attendanceDraft.wasLeader}
                onChange={(event) =>
                  setAttendanceDraft({
                    ...attendanceDraft,
                    wasLeader: event.target.checked,
                  })
                }
              />
              <span>
                <strong>I led this event or raid</strong>
                <small>Keep this marker for future hero-period reference.</small>
              </span>
            </label>
            <label>
              <span>Notes for future reference</span>
              <textarea
                value={attendanceDraft.notes}
                onChange={(event) =>
                  setAttendanceDraft({
                    ...attendanceDraft,
                    notes: event.target.value,
                  })
                }
                placeholder="Raid composition, outcome, reminders…"
                rows={4}
              />
            </label>
          </div>
          <footer className="modal-actions">
            {state.attendance.some((item) => item.id === attendanceDraft.id) && (
              <button
                type="button"
                className="danger-text"
                onClick={() => {
                  removeAttendance(attendanceDraft);
                  setAttendanceDraft(null);
                  setAttendanceEvent(null);
                }}
              >
                Remove attendance
              </button>
            )}
            <span />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setAttendanceDraft(null)}
            >
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={saveAttendance}>
              Save · +
              {attendanceDraft.quests
                .filter((item) => item.completed)
                .reduce((sum, item) => sum + item.leadership, 0)}{" "}
              LS
            </button>
          </footer>
        </Modal>
      )}

      {onboarding && (
        <Modal title={state.ign ? "Edit your character" : "Make it yours"} eyebrow="ArcheAge Command Center" onClose={() => state.ign && setOnboarding(false)}>
          <div className="modal-body onboarding-body">
            <div className="onboarding-orbit">
              <span>LS</span>
            </div>
            <p>
              Your tracker lives entirely in this browser. Start with the name
              you want at the top of the command center.
            </p>
            <label>
              <span>In-game name</span>
              <input
                autoFocus
                value={state.ign}
                onChange={(event) =>
                  update((draft) => {
                    draft.ign = event.target.value;
                  })
                }
                placeholder="Your character name"
              />
            </label>
          </div>
          <footer className="modal-actions">
            <span />
            <button
              type="button"
              className="primary-button"
              disabled={!state.ign.trim()}
              onClick={() => {
                setOnboarding(false);
                toast(`Welcome, ${state.ign}`);
              }}
            >
              Enter command center
            </button>
          </footer>
        </Modal>
      )}

      {planDraftOpen && (
        <PlanModal
          state={state}
          initialDate={calendarKey || currentResetKey}
          onClose={() => setPlanDraftOpen(false)}
          onSave={(plan) => {
            if (findPlan(state, plan.eventId, plan.startUtc)) {
              toast("That event is already in your plan", "warn");
              return;
            }
            update((draft) => draft.plans.push(plan));
            setPlanDraftOpen(false);
            toast("Plan added to the calendar");
          }}
        />
      )}

      {eventDraft && (
        <EventEditor
          draft={eventDraft}
          setDraft={setEventDraft}
          onClose={() => setEventDraft(null)}
          onSave={saveEvent}
          onDelete={() => {
            const used =
              state.plans.some((item) => item.eventId === eventDraft.id) ||
              state.attendance.some((item) => item.eventId === eventDraft.id);
            if (
              !window.confirm(
                used
                  ? `Archive ${eventDraft.name}? Its history and plans will stay editable.`
                  : `Delete ${eventDraft.name}?`,
              )
            )
              return;
            update((draft) => {
              if (used) {
                const definition = draft.events.find(
                  (item) => item.id === eventDraft.id,
                );
                if (definition) definition.enabled = false;
              } else {
                draft.events = draft.events.filter(
                  (item) => item.id !== eventDraft.id,
                );
              }
            });
            setEventDraft(null);
            toast(used ? "Event archived" : "Event definition removed", "warn");
          }}
        />
      )}

      {ledgerDraft && (
        <Modal title="Edit leadership entry" eyebrow="Advanced ledger" onClose={() => setLedgerDraft(null)}>
          <div className="modal-body form-grid">
            <label>
              <span>Date & time</span>
              <input
                type="datetime-local"
                value={toDateTimeLocal(ledgerDraft.earnedUtc)}
                onChange={(event) =>
                  setLedgerDraft({
                    ...ledgerDraft,
                    earnedUtc: fromDateTimeLocal(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <span>Leadership</span>
              <input
                type="number"
                value={ledgerDraft.amount}
                onChange={(event) =>
                  setLedgerDraft({
                    ...ledgerDraft,
                    amount: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <span>Source</span>
              <input
                value={ledgerDraft.source}
                onChange={(event) =>
                  setLedgerDraft({ ...ledgerDraft, source: event.target.value })
                }
              />
            </label>
          </div>
          <footer className="modal-actions">
            {state.entries.some((item) => item.id === ledgerDraft.id) && (
              <button
                type="button"
                className="danger-text"
                onClick={() => {
                  update((draft) => {
                    draft.entries = draft.entries.filter(
                      (item) => item.id !== ledgerDraft.id,
                    );
                  });
                  setLedgerDraft(null);
                  toast("Ledger entry removed", "warn");
                }}
              >
                Delete entry
              </button>
            )}
            <span />
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                update((draft) => {
                  const index = draft.entries.findIndex(
                    (item) => item.id === ledgerDraft.id,
                  );
                  if (index >= 0) draft.entries[index] = ledgerDraft;
                  else draft.entries.push(ledgerDraft);
                });
                setLedgerDraft(null);
                toast("Ledger entry saved");
              }}
            >
              Save entry
            </button>
          </footer>
        </Modal>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.tone ?? "good"}`}>
            <span>{item.tone === "warn" ? "!" : "✓"}</span>
            {item.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanModal({
  state,
  initialDate,
  onClose,
  onSave,
}: {
  state: TrackerState;
  initialDate: string;
  onClose: () => void;
  onSave: (plan: PlannedEvent) => void;
}) {
  const [eventId, setEventId] = useState(
    state.events.find((item) => item.enabled)?.id ?? "",
  );
  const [localTime, setLocalTime] = useState(`${initialDate}T12:00`);
  const [alert, setAlert] = useState(true);
  return (
    <Modal title="Add a planned raid" eyebrow="Calendar intention" onClose={onClose}>
      <div className="modal-body form-grid">
        <label>
          <span>Event type</span>
          <select value={eventId} onChange={(event) => setEventId(event.target.value)}>
            {state.events
              .filter((item) => item.enabled)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Local date & time</span>
          <input
            type="datetime-local"
            value={localTime}
            onChange={(event) => setLocalTime(event.target.value)}
          />
        </label>
        <label className="leader-check">
          <input
            type="checkbox"
            checked={alert}
            onChange={(event) => setAlert(event.target.checked)}
          />
          <span>
            <strong>Alert ten minutes before</strong>
            <small>Requires desktop alerts to be enabled in Manage.</small>
          </span>
        </label>
      </div>
      <footer className="modal-actions">
        <span />
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            onSave({
              id: uid("plan"),
              eventId,
              startUtc: new Date(localTime).toISOString(),
              alert,
            })
          }
        >
          Add to plan
        </button>
      </footer>
    </Modal>
  );
}

function EventEditor({
  draft,
  setDraft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: EventDefinition;
  setDraft: (value: EventDefinition) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal title={draft.name} eyebrow="Event definition" onClose={onClose} wide>
      <div className="modal-body">
        <div className="form-grid four event-basics">
          <label className="span-two">
            <span>Event name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>Time basis</span>
            <select
              value={draft.basis}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  basis: event.target.value as EventDefinition["basis"],
                })
              }
            >
              <option value="server">Server time</option>
              <option value="game">In-game time</option>
            </select>
          </label>
          <label>
            <span>Accent</span>
            <input
              type="color"
              value={draft.accent}
              onChange={(event) =>
                setDraft({ ...draft, accent: event.target.value })
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="preference-row compact-row"
          onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
        >
          <span>
            <strong>Show this event</strong>
            <small>Hidden events stay in existing history.</small>
          </span>
          <span className={`switch ${draft.enabled ? "on" : ""}`} />
        </button>

        <div className="editor-section">
          <div className="editor-section-head">
            <div>
              <p className="eyebrow">Scheduled times</p>
              <p>Day is optional. All-day events use your server reset boundary.</p>
            </div>
            <button
              type="button"
              className="secondary-button small"
              onClick={() =>
                setDraft({
                  ...draft,
                  schedules: [
                    ...draft.schedules,
                    { id: uid("slot"), hour: 12, minute: 0 },
                  ],
                })
              }
            >
              + Time
            </button>
          </div>
          <div className="editable-rows">
            {draft.schedules.map((item, index) => (
              <div className="editable-row schedule-edit-row" key={item.id}>
                <select
                  value={item.day ?? ""}
                  onChange={(event) => {
                    const next = clone(draft);
                    next.schedules[index].day =
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value);
                    setDraft(next);
                  }}
                  aria-label="Scheduled day"
                >
                  <option value="">Every day</option>
                  {DAY_NAMES.map((day, dayIndex) => (
                    <option value={dayIndex} key={day}>
                      {day}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={item.hour}
                  disabled={item.allDay}
                  aria-label="Hour"
                  onChange={(event) => {
                    const next = clone(draft);
                    next.schedules[index].hour = Number(event.target.value);
                    setDraft(next);
                  }}
                />
                <span>:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={item.minute}
                  disabled={item.allDay}
                  aria-label="Minute"
                  onChange={(event) => {
                    const next = clone(draft);
                    next.schedules[index].minute = Number(event.target.value);
                    setDraft(next);
                  }}
                />
                <input
                  value={item.label ?? ""}
                  placeholder="Zone / label"
                  aria-label="Zone or label"
                  onChange={(event) => {
                    const next = clone(draft);
                    next.schedules[index].label = event.target.value;
                    setDraft(next);
                  }}
                />
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={!!item.allDay}
                    onChange={(event) => {
                      const next = clone(draft);
                      next.schedules[index].allDay = event.target.checked;
                      setDraft(next);
                    }}
                  />
                  All day
                </label>
                <button
                  type="button"
                  className="remove-row"
                  aria-label="Remove time"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      schedules: draft.schedules.filter(
                        (schedule) => schedule.id !== item.id,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="editor-section">
          <div className="editor-section-head">
            <div>
              <p className="eyebrow">Leadership quests</p>
              <p>A shared group links daily quests such as CR and Tony.</p>
            </div>
            <button
              type="button"
              className="secondary-button small"
              onClick={() =>
                setDraft({
                  ...draft,
                  quests: [
                    ...draft.quests,
                    {
                      id: uid("quest"),
                      name: "New quest",
                      cadence: "daily",
                      leadership: 10,
                      sharedGroup: "",
                    },
                  ],
                })
              }
            >
              + Quest
            </button>
          </div>
          <div className="editable-rows">
            {draft.quests.map((item, index) => (
              <div className="editable-row quest-edit-row" key={item.id}>
                <input
                  value={item.name}
                  aria-label="Quest name"
                  onChange={(event) => {
                    const next = clone(draft);
                    next.quests[index].name = event.target.value;
                    setDraft(next);
                  }}
                />
                <select
                  value={item.cadence}
                  aria-label="Quest cadence"
                  onChange={(event) => {
                    const next = clone(draft);
                    next.quests[index].cadence = event.target
                      .value as typeof item.cadence;
                    setDraft(next);
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="repeatable">Repeatable</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={item.leadership}
                  aria-label="Leadership granted"
                  onChange={(event) => {
                    const next = clone(draft);
                    next.quests[index].leadership = Number(event.target.value);
                    setDraft(next);
                  }}
                />
                <input
                  value={item.sharedGroup ?? ""}
                  placeholder="Shared group (optional)"
                  aria-label="Shared quest group"
                  onChange={(event) => {
                    const next = clone(draft);
                    next.quests[index].sharedGroup = event.target.value;
                    setDraft(next);
                  }}
                />
                <button
                  type="button"
                  className="remove-row"
                  aria-label="Remove quest"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      quests: draft.quests.filter((quest) => quest.id !== item.id),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <footer className="modal-actions">
        <button type="button" className="danger-text" onClick={onDelete}>
          Delete event
        </button>
        <span />
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={onSave}>
          Save event
        </button>
      </footer>
    </Modal>
  );
}
