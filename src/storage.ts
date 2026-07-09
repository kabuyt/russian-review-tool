import { starterItems } from "./data";
import type { HistoryEntry, SrsRecord, StoredState, StudyItem } from "./types";

const key = "russian-review-tool:v1";

const todayIso = () => new Date().toISOString();

export function createSrsRecord(itemId: string, dueAt = todayIso()): SrsRecord {
  return {
    itemId,
    intervalDays: 0,
    ease: 2.5,
    repetitions: 0,
    lapses: 0,
    dueAt,
  };
}

function normalizeState(state: Partial<StoredState>): StoredState {
  const byId = new Map<string, StudyItem>();
  [...starterItems, ...(state.items ?? [])].forEach((item) => byId.set(item.id, item));
  const items = Array.from(byId.values());
  const srs = { ...(state.srs ?? {}) };
  items.forEach((item) => {
    srs[item.id] ??= createSrsRecord(item.id);
  });

  return {
    items,
    srs,
    history: state.history ?? [],
    conversationLog: state.conversationLog ?? "",
    dailyReviews: state.dailyReviews ?? [],
  };
}

export function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return normalizeState({});
    return normalizeState(JSON.parse(raw) as Partial<StoredState>);
  } catch {
    return normalizeState({});
  }
}

export function saveState(state: StoredState) {
  localStorage.setItem(key, JSON.stringify(state));
}

export function exportHistory(entries: HistoryEntry[]) {
  const header = ["reviewedAt", "ru", "prompt", "typedAnswer", "correct"];
  const rows = entries.map((entry) =>
    [entry.reviewedAt, entry.ru, entry.prompt, entry.typedAnswer, String(entry.correct)]
      .map((value) => `"${value.replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
