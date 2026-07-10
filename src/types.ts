export type TabId = "cards" | "choice" | "listen" | "speak" | "wrong" | "conversation" | "history";

export type StudyItem = {
  id: string;
  ru: string;
  ja: string;
  en: string;
  source: "starter" | "conversation" | "json";
  createdAt: string;
  reviewDate?: string;
  itemType?: "word" | "phrase";
};

export type ReviewMistake = {
  title: string;
  bad: string;
  good: string;
  note: string;
  date?: string;
};

export type DailyReview = {
  id: string;
  date: string;
  language: string;
  level: string;
  words: StudyItem[];
  phrases: StudyItem[];
  mistakes: ReviewMistake[];
  importedAt: string;
};

export type QuizItem = {
  id: string;
  prompt: string;
  answer: string;
  hint?: string;
  source: StudyItem["source"];
};

export type SrsRecord = {
  itemId: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt?: string;
};

export type HistoryEntry = {
  id: string;
  itemId: string;
  ru: string;
  prompt: string;
  correct: boolean;
  typedAnswer: string;
  reviewedAt: string;
};

export type StoredState = {
  items: StudyItem[];
  srs: Record<string, SrsRecord>;
  history: HistoryEntry[];
  conversationLog: string;
  dailyReviews: DailyReview[];
};
