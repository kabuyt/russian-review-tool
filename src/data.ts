import type { QuizItem, StudyItem } from "./types";

const now = new Date().toISOString();

export const starterItems: StudyItem[] = [
  { ru: "Привет", ja: "こんにちは", en: "Hi" },
  { ru: "Как дела?", ja: "元気ですか？", en: "How are you?" },
  { ru: "А у тебя?", ja: "あなたは？", en: "And you?" },
  { ru: "Понял.", ja: "わかりました", en: "I understood." },
  { ru: "Что это значит?", ja: "これはどういう意味？", en: "What does it mean?" },
  { ru: "Мне нравится.", ja: "私は好きです", en: "I like it." },
  { ru: "Мне не нравится.", ja: "私は好きではありません", en: "I don't like it." },
  { ru: "Я играю на гитаре.", ja: "私はギターを弾きます", en: "I play guitar." },
  { ru: "Двадцать лет", ja: "20年", en: "Twenty years" },
  { ru: "Я работал.", ja: "私は働きました", en: "I worked." },
  { ru: "Я буду работать.", ja: "私は働きます", en: "I will work." },
  { ru: "Я устал.", ja: "私は疲れました", en: "I am tired." },
  { ru: "Сегодня", ja: "今日", en: "Today" },
  { ru: "Завтра", ja: "明日", en: "Tomorrow" },
  { ru: "Что ты сегодня ел?", ja: "今日は何を食べましたか？", en: "What did you eat today?" },
  { ru: "Я ел гамбургер.", ja: "ハンバーガーを食べました", en: "I ate a hamburger." },
  { ru: "Я ел лапшу рамен.", ja: "ラーメンを食べました", en: "I ate ramen noodles." },
  { ru: "Обед", ja: "昼ごはん", en: "Lunch" },
  { ru: "Тепло", ja: "暖かいです", en: "Warm, weather" },
  { ru: "Холодно", ja: "寒いです", en: "Cold, weather" },
].map((item, index) => ({
  ...item,
  id: `starter-${index + 1}`,
  source: "starter",
  createdAt: now,
}));

export const starterQuizzes: QuizItem[] = [
  { prompt: "I play guitar.", answer: "Я играю на гитаре.", hint: "играть + на", source: "starter" },
  { prompt: "I will work.", answer: "Я буду работать.", hint: "буду + infinitive", source: "starter" },
  { prompt: "I am tired.", answer: "Я устал.", hint: "male speaker form", source: "starter" },
  { prompt: "What does it mean?", answer: "Что это значит?", hint: "что + значит", source: "starter" },
  { prompt: "I ate ramen noodles.", answer: "Я ел лапшу рамен.", hint: "ел + object", source: "starter" },
  { prompt: "Today was warm.", answer: "Сегодня было тепло.", hint: "weather uses тепло", source: "starter" },
  { prompt: "I like it.", answer: "Мне нравится.", hint: "мне + нравится", source: "starter" },
].map((quiz, index) => ({ ...quiz, id: `starter-quiz-${index + 1}`, source: "starter" as const }));

export const mistakes = [
  {
    title: "今日のミス 1",
    bad: "Я играешь на гитаре.",
    good: "Я играю на гитаре.",
    note: "「私」は играю。",
  },
  {
    title: "今日のミス 2",
    bad: "Какие темы ты нравится?",
    good: "Какие темы тебе нравятся?",
    note: "「あなたに」は тебе。",
  },
  {
    title: "今日のミス 3",
    bad: "Сегодня тепла.",
    good: "Сегодня было тепло.",
    note: "天気は тепло。",
  },
];
