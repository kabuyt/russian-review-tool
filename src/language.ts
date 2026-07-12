import type { QuizItem, StudyItem, TargetLanguage } from "./types";

const cyrillicPattern = /[А-Яа-яЁё][А-Яа-яЁё0-9 ,.!?'"«»:-]{1,}/g;
const vietnamesePattern = /[A-Za-zÀ-ỹĐđ][A-Za-zÀ-ỹĐđ0-9 ,.!?'"-]{1,}/g;

export function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.!?？。]/g, "")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

export function speechLang(language: TargetLanguage) {
  return language === "vi" ? "vi-VN" : "ru-RU";
}

export function speakTargetText(text: string, language: TargetLanguage) {
  if (!("speechSynthesis" in window)) {
    globalThis.alert("このブラウザは音声読み上げに対応していません。");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const lang = speechLang(language);
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith(language)) ?? null;
  utterance.lang = lang;
  utterance.rate = 0.75;
  utterance.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function extractTargetPhrases(log: string, knownItems: StudyItem[], language: TargetLanguage): StudyItem[] {
  const known = new Set(knownItems.map((item) => normalizeAnswer(item.ru)));
  const seen = new Set<string>();
  const matches = log.match(language === "vi" ? vietnamesePattern : cyrillicPattern) ?? [];

  return matches
    .map((match) => match.trim().replace(/\s+/g, " "))
    .filter((phrase) => phrase.length >= 2)
    .filter((phrase) => {
      const normalized = normalizeAnswer(phrase);
      if (known.has(normalized) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 24)
    .map((ru, index) => ({
      id: `${language}-conversation-${Date.now()}-${index}`,
      ru,
      ja: "会話ログから追加",
      en: "Generated from conversation log",
      source: "conversation",
      createdAt: new Date().toISOString(),
      language,
    }));
}

export function makeGeneratedQuizzes(items: StudyItem[]): QuizItem[] {
  return items
    .filter((item) => item.source === "conversation")
    .map((item) => ({
      id: `quiz-${item.id}`,
      prompt: `会話ログの表現: ${item.ja}`,
      answer: item.ru,
      hint: item.ru.split(/\s+/).slice(0, 2).join(" "),
      source: "conversation",
    }));
}
