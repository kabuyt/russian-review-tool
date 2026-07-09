import type { SrsRecord } from "./types";

const dayMs = 24 * 60 * 60 * 1000;

export function isDue(record: SrsRecord, now = new Date()) {
  return new Date(record.dueAt).getTime() <= now.getTime();
}

export function formatDue(dueAt: string) {
  const diff = Math.ceil((new Date(dueAt).getTime() - Date.now()) / dayMs);
  if (diff <= 0) return "今日";
  if (diff === 1) return "明日";
  return `${diff}日後`;
}

export function gradeSrs(record: SrsRecord, quality: "again" | "hard" | "good" | "easy"): SrsRecord {
  const now = new Date();
  const next = { ...record, lastReviewedAt: now.toISOString() };

  if (quality === "again") {
    next.repetitions = 0;
    next.intervalDays = 0;
    next.ease = Math.max(1.3, next.ease - 0.2);
    next.lapses += 1;
    next.dueAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    return next;
  }

  const qualityBonus = quality === "easy" ? 0.15 : quality === "hard" ? -0.15 : 0;
  next.ease = Math.max(1.3, next.ease + qualityBonus);
  next.repetitions += 1;

  if (next.repetitions === 1) {
    next.intervalDays = quality === "hard" ? 1 : 2;
  } else if (next.repetitions === 2) {
    next.intervalDays = quality === "easy" ? 6 : 4;
  } else {
    const multiplier = quality === "hard" ? 1.2 : quality === "easy" ? next.ease + 0.4 : next.ease;
    next.intervalDays = Math.max(1, Math.round(next.intervalDays * multiplier));
  }

  next.dueAt = new Date(now.getTime() + next.intervalDays * dayMs).toISOString();
  return next;
}
