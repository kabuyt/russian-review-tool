import {
  BarChart3,
  BookOpen,
  Brain,
  Check,
  Download,
  History,
  Mic2,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { mistakes } from "./data";
import { extractRussianPhrases, speakRussian } from "./language";
import { exportHistory, loadState, saveState, createSrsRecord } from "./storage";
import { formatDue, gradeSrs, isDue } from "./srs";
import type { DailyReview, HistoryEntry, ReviewMistake, StoredState, StudyItem, TabId } from "./types";

const tabs: Array<{ id: TabId; label: string; icon: typeof BookOpen }> = [
  { id: "cards", label: "カード", icon: BookOpen },
  { id: "choice", label: "選択", icon: Brain },
  { id: "listen", label: "聞く", icon: Volume2 },
  { id: "speak", label: "声出し", icon: Mic2 },
  { id: "wrong", label: "ミス復習", icon: RotateCcw },
];

function scoreLabel(correct: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((correct / total) * 100)}%`;
}

function stableHash(value: string) {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function makeChoices(item: StudyItem, items: StudyItem[], field: "ja" | "ru") {
  const correct = item[field];
  const offset = stableHash(item.id + field);
  const distractors = items
    .filter((candidate) => candidate.id !== item.id)
    .map((candidate) => candidate[field])
    .filter((value, index, values) => value !== correct && values.indexOf(value) === index);
  const rotated = [...distractors.slice(offset % Math.max(1, distractors.length)), ...distractors.slice(0, offset % Math.max(1, distractors.length))];
  const raw = [correct, ...rotated].slice(0, 4);
  return raw
    .map((value, index) => ({ value, score: stableHash(`${item.id}-${field}-${value}-${index}`) }))
    .sort((a, b) => a.score - b.score)
    .map((choice) => choice.value);
}

type ReviewJsonEntry =
  | string
  | {
      ru?: unknown;
      russian?: unknown;
      text?: unknown;
      word?: unknown;
      phrase?: unknown;
      ja?: unknown;
      japanese?: unknown;
      meaning?: unknown;
      translation?: unknown;
      en?: unknown;
      english?: unknown;
      note?: unknown;
    };

type ReviewJsonMistake =
  | string
  | {
      title?: unknown;
      bad?: unknown;
      wrong?: unknown;
      incorrect?: unknown;
      good?: unknown;
      correct?: unknown;
      note?: unknown;
      explanation?: unknown;
    };

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function itemText(entry: ReviewJsonEntry) {
  if (typeof entry === "string") return entry.trim();
  return asText(entry.ru) || asText(entry.russian) || asText(entry.text) || asText(entry.word) || asText(entry.phrase);
}

function itemJa(entry: ReviewJsonEntry, fallback: string) {
  if (typeof entry === "string") return fallback;
  return asText(entry.ja) || asText(entry.japanese) || asText(entry.meaning) || asText(entry.translation) || fallback;
}

function itemEn(entry: ReviewJsonEntry) {
  if (typeof entry === "string") return "Imported from ChatGPT JSON";
  return asText(entry.en) || asText(entry.english) || asText(entry.note) || "Imported from ChatGPT JSON";
}

function parseMistake(entry: ReviewJsonMistake, index: number, date: string): ReviewMistake {
  if (typeof entry === "string") {
    return {
      title: `JSONミス ${index + 1}`,
      bad: entry.trim(),
      good: "",
      note: "ChatGPT JSONから追加",
      date,
    };
  }

  return {
    title: asText(entry.title) || `JSONミス ${index + 1}`,
    bad: asText(entry.bad) || asText(entry.wrong) || asText(entry.incorrect),
    good: asText(entry.good) || asText(entry.correct),
    note: asText(entry.note) || asText(entry.explanation) || "ChatGPT JSONから追加",
    date,
  };
}

function buildJsonItem(entry: ReviewJsonEntry, kind: "word" | "phrase", date: string, index: number): StudyItem | null {
  const ru = itemText(entry);
  if (!ru) return null;
  const id = `json-${date}-${kind}-${stableHash(`${ru}-${index}`)}`;
  return {
    id,
    ru,
    ja: itemJa(entry, `${date}の${kind === "word" ? "単語" : "フレーズ"}`),
    en: itemEn(entry),
    source: "json",
    createdAt: new Date().toISOString(),
    reviewDate: date,
    itemType: kind,
  };
}

function App() {
  const [tab, setTab] = useState<TabId>("cards");
  const [state, setState] = useState<StoredState>(() => loadState());
  const [cardIndex, setCardIndex] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [listenIndex, setListenIndex] = useState(0);
  const [speakIndex, setSpeakIndex] = useState(0);
  const [speakOpen, setSpeakOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ itemId: string; correct: boolean; value: string } | null>(null);
  const [reviewJson, setReviewJson] = useState("");
  const [jsonMessage, setJsonMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const dueItems = useMemo(
    () => state.items.filter((item) => isDue(state.srs[item.id])).slice(0, 12),
    [state.items, state.srs],
  );
  const wrongItems = useMemo(() => {
    const latestByItem = new Map<string, boolean>();
    state.history.forEach((entry) => {
      if (!latestByItem.has(entry.itemId)) latestByItem.set(entry.itemId, entry.correct);
    });
    const ids = new Set(
      Array.from(latestByItem.entries())
        .filter(([, correct]) => !correct)
        .map(([itemId]) => itemId),
    );
    return state.items.filter((item) => ids.has(item.id));
  }, [state.history, state.items]);
  const cardItem = state.items[cardIndex % state.items.length];
  const choiceItem = state.items[choiceIndex % state.items.length];
  const listenItem = state.items[listenIndex % state.items.length];
  const speakItem = state.items[speakIndex % state.items.length];
  const currentSrsItem = dueItems[0] ?? state.items[0];
  const wrongItem = wrongItems[0] ?? dueItems[0] ?? state.items[0];
  const correctCount = state.history.filter((entry) => entry.correct).length;
  const todayCount = state.history.filter(
    (entry) => new Date(entry.reviewedAt).toDateString() === new Date().toDateString(),
  ).length;
  const importedMistakes = useMemo(
    () => state.dailyReviews.flatMap((review) => review.mistakes).slice(0, 12),
    [state.dailyReviews],
  );
  const visibleMistakes = useMemo<ReviewMistake[]>(
    () => [...importedMistakes, ...mistakes.map((mistake) => ({ ...mistake }))].slice(0, 6),
    [importedMistakes],
  );

  function commitHistory(entry: Omit<HistoryEntry, "id" | "reviewedAt">) {
    setState((current) => ({
      ...current,
      history: [
        {
          ...entry,
          id: crypto.randomUUID(),
          reviewedAt: new Date().toISOString(),
        },
        ...current.history,
      ].slice(0, 500),
    }));
  }

  function gradeItem(item: StudyItem, quality: "again" | "hard" | "good" | "easy", prompt: string, selected: string) {
    const record = state.srs[item.id] ?? createSrsRecord(item.id);
    const correct = quality !== "again";
    setState((current) => ({
      ...current,
      srs: {
        ...current.srs,
        [item.id]: gradeSrs(record, quality),
      },
      history: [
        {
          id: crypto.randomUUID(),
          itemId: item.id,
          ru: item.ru,
          prompt,
          typedAnswer: selected,
          correct,
          reviewedAt: new Date().toISOString(),
        },
        ...current.history,
      ].slice(0, 500),
    }));
  }

  function chooseMeaning(item: StudyItem, value: string, mode: "choice" | "listen") {
    const correct = value === item.ja;
    setFeedback({ itemId: item.id, correct, value });
    gradeItem(item, correct ? "good" : "again", mode === "listen" ? "audio meaning choice" : "meaning choice", value);
  }

  function chooseRussian(item: StudyItem, value: string) {
    const correct = value === item.ru;
    setFeedback({ itemId: item.id, correct, value });
    gradeItem(item, correct ? "good" : "again", "wrong review", value);
  }

  function markCard(item: StudyItem, known: boolean) {
    gradeItem(item, known ? "good" : "again", "word card", known ? "わかった" : "まだ");
    setCardIndex((index) => (index + 1) % state.items.length);
  }

  function recordSpeakPractice() {
    gradeItem(speakItem, "good", "speak aloud", "声に出した");
    setSpeakOpen(false);
    setSpeakIndex((index) => (index + 1) % state.items.length);
  }

  function nextChoice() {
    setChoiceIndex((index) => (index + 1) % state.items.length);
    setFeedback(null);
  }

  function nextListen() {
    setListenIndex((index) => (index + 1) % state.items.length);
    setFeedback(null);
  }

  function clearWrong(item: StudyItem) {
    commitHistory({
      itemId: item.id,
      ru: item.ru,
      prompt: "wrong review cleared",
      typedAnswer: "復習した",
      correct: true,
    });
  }

  function gradeCurrentSrs(quality: "again" | "hard" | "good" | "easy") {
    const label = {
      again: "もう一回",
      hard: "むずかしい",
      good: "できた",
      easy: "簡単",
    }[quality];
    gradeItem(currentSrsItem, quality, "SRS review", label);
  }

  function generateFromConversation() {
    const additions = extractRussianPhrases(state.conversationLog, state.items);
    if (additions.length === 0) return;
    setState((current) => {
      const srs = { ...current.srs };
      additions.forEach((item) => {
        srs[item.id] = createSrsRecord(item.id);
      });
      return {
        ...current,
        items: [...additions, ...current.items],
        srs,
      };
    });
    setTab("choice");
  }

  function importDailyReviewJson() {
    setJsonMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(reviewJson);
    } catch {
      setJsonMessage({ kind: "error", text: "JSONの形式を確認してください。" });
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      setJsonMessage({ kind: "error", text: "JSONオブジェクトを貼り付けてください。" });
      return;
    }

    const data = parsed as Record<string, unknown>;
    const date = asText(data.date);
    const language = asText(data.language);
    const level = asText(data.level);
    const wordsRaw = Array.isArray(data.words) ? (data.words as ReviewJsonEntry[]) : null;
    const phrasesRaw = Array.isArray(data.phrases) ? (data.phrases as ReviewJsonEntry[]) : null;
    const mistakesRaw = Array.isArray(data.mistakes) ? (data.mistakes as ReviewJsonMistake[]) : null;

    if (!date || !language || !level || !wordsRaw || !phrasesRaw || !mistakesRaw) {
      setJsonMessage({ kind: "error", text: "date, language, level, words, phrases, mistakes を含めてください。" });
      return;
    }

    const words = wordsRaw
      .map((entry, index) => buildJsonItem(entry, "word", date, index))
      .filter((item): item is StudyItem => Boolean(item));
    const phrases = phrasesRaw
      .map((entry, index) => buildJsonItem(entry, "phrase", date, index))
      .filter((item): item is StudyItem => Boolean(item));
    const reviewMistakes = mistakesRaw
      .map((entry, index) => parseMistake(entry, index, date))
      .filter((mistake) => mistake.bad || mistake.good || mistake.note);

    if (words.length + phrases.length === 0) {
      setJsonMessage({ kind: "error", text: "words または phrases にロシア語テキストを入れてください。" });
      return;
    }

    const dailyReview: DailyReview = {
      id: `review-${date}-${stableHash(`${language}-${level}`)}`,
      date,
      language,
      level,
      words,
      phrases,
      mistakes: reviewMistakes,
      importedAt: new Date().toISOString(),
    };

    setState((current) => {
      const existingRu = new Set(current.items.map((item) => item.ru.trim().toLowerCase()));
      const additions = [...words, ...phrases].filter((item) => !existingRu.has(item.ru.trim().toLowerCase()));
      const srs = { ...current.srs };
      additions.forEach((item) => {
        srs[item.id] = createSrsRecord(item.id);
      });
      return {
        ...current,
        items: [...additions, ...current.items],
        srs,
        dailyReviews: [dailyReview, ...current.dailyReviews.filter((review) => review.id !== dailyReview.id)].slice(0, 90),
      };
    });
    setCardIndex(0);
    setReviewJson("");
    setJsonMessage({ kind: "ok", text: `${date}の復習データを保存しました。単語 ${words.length}件、フレーズ ${phrases.length}件。` });
    setTab("cards");
  }

  function downloadHistory() {
    const blob = new Blob([exportHistory(state.history)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "russian-review-history.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">A1 Russian</p>
          <h1>ロシア語ミニ復習ツール</h1>
          <p className="sub">会話から拾って、声に出して、忘れる前に復習。</p>
        </div>
        <div className="stats" aria-label="学習統計">
          <div>
            <span>{todayCount}</span>
            <small>today</small>
          </div>
          <div>
            <span>{scoreLabel(correctCount, state.history.length)}</span>
            <small>accuracy</small>
          </div>
          <div>
            <span>{dueItems.length}</span>
            <small>due</small>
          </div>
        </div>
      </header>

      <div className="utility-nav" aria-label="補助メニュー">
        <button
          className={tab === "srs" ? "utility-button active" : "utility-button"}
          type="button"
          onClick={() => setTab("srs")}
        >
          <RotateCcw size={16} />
          SRS
        </button>
        <button
          className={tab === "conversation" ? "utility-button active" : "utility-button"}
          type="button"
          onClick={() => setTab("conversation")}
        >
          <Sparkles size={16} />
          会話ログ
        </button>
        <button
          className={tab === "history" ? "utility-button active" : "utility-button"}
          type="button"
          onClick={() => setTab("history")}
        >
          <History size={16} />
          履歴
        </button>
      </div>

      <nav className="tabs" aria-label="メインメニュー">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={tab === id ? "tab active" : "tab"}
            key={id}
            onClick={() => setTab(id)}
            title={label}
            type="button"
          >
            <Icon size={18} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main>
        {tab === "cards" && (
          <section className="mobile-stack">
            <article className="drill-card hero-card">
              <div className="card-head">
                <span className="label">単語カード</span>
                  <span className="source">{cardIndex + 1} / {state.items.length}</span>
                </div>
              {cardItem.reviewDate && <span className="date-chip">{cardItem.reviewDate}</span>}
              <h2 lang="ru">{cardItem.ru}</h2>
              <p className="meaning-line">JP: {cardItem.ja}</p>
              <p className="meaning-line">EN: {cardItem.en}</p>
              <button className="wide-button" type="button" onClick={() => speakRussian(cardItem.ru)}>
                <Volume2 size={20} />
                音声を聞く
              </button>
              <div className="thumb-row">
                <button className="good" type="button" onClick={() => markCard(cardItem, true)}>
                  <Check size={20} />
                  わかった
                </button>
                <button className="bad" type="button" onClick={() => markCard(cardItem, false)}>
                  <X size={20} />
                  まだ
                </button>
              </div>
            </article>
            <div className="focus-card compact-focus">
              <div className="pill-row">
                <span className="pill">играю</span>
                <span className="pill">нравится</span>
                <span className="pill">тепло</span>
              </div>
              <p>短く見て、聞いて、わかったら次へ。</p>
            </div>
          </section>
        )}

        {tab === "choice" && (
          <section className="two-column">
            <div className="practice-card drill-card">
              <div className="label">選択式クイズ</div>
              <h2 lang="ru">{choiceItem.ru}</h2>
              <div className="choice-grid">
                {makeChoices(choiceItem, state.items, "ja").map((choice) => (
                  <button
                    className="choice-button"
                    type="button"
                    key={choice}
                    onClick={() => chooseMeaning(choiceItem, choice, "choice")}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              {feedback?.itemId === choiceItem.id && (
                <div className={`answer-box ${feedback.correct ? "correct" : "wrong"}`}>
                  {feedback.correct ? "正解です。" : "正解はこちら。"}
                  <strong>{choiceItem.ja}</strong>
                </div>
              )}
              <button className="wide-button secondary" type="button" onClick={nextChoice}>
                次へ
              </button>
            </div>
            <aside className="quiet-panel">
              <div className="label">今日のミス</div>
              {visibleMistakes.map((mistake, index) => (
                <div className="mistake" key={`${mistake.date ?? "starter"}-${mistake.title}-${index}`}>
                  <b>{mistake.date ? `${mistake.date} / ${mistake.title}` : mistake.title}</b>
                  {mistake.bad && (
                    <p lang="ru">
                      <X size={16} /> {mistake.bad}
                    </p>
                  )}
                  {mistake.good && (
                    <p lang="ru">
                      <Check size={16} /> {mistake.good}
                    </p>
                  )}
                  <small>{mistake.note}</small>
                </div>
              ))}
            </aside>
          </section>
        )}

        {tab === "listen" && (
          <section className="mobile-stack">
            <div className="practice-card drill-card">
              <div className="label">聞いて意味を選ぶ</div>
              <button className="listen-button" type="button" onClick={() => speakRussian(listenItem.ru)}>
                <Volume2 size={34} />
                音声を再生
              </button>
              <div className="choice-grid">
                {makeChoices(listenItem, state.items, "ja").map((choice) => (
                  <button
                    className="choice-button"
                    type="button"
                    key={choice}
                    onClick={() => chooseMeaning(listenItem, choice, "listen")}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              {feedback?.itemId === listenItem.id && (
                <div className={`answer-box ${feedback.correct ? "correct" : "wrong"}`}>
                  <strong lang="ru">{listenItem.ru}</strong>
                  <span>{listenItem.ja}</span>
                </div>
              )}
              <button className="wide-button secondary" type="button" onClick={nextListen}>
                次へ
              </button>
            </div>
          </section>
        )}

        {tab === "speak" && (
          <section className="mobile-stack">
            <div className="practice-card drill-card">
              <div className="label">日本語 → 声に出す</div>
              <h2>{speakItem.ja}</h2>
              {!speakOpen ? (
                <button className="wide-button" type="button" onClick={() => setSpeakOpen(true)}>
                  ロシア語を表示
                </button>
              ) : (
                <div className="answer-box speak-box">
                  <strong lang="ru">{speakItem.ru}</strong>
                  <div className="button-row">
                    <button type="button" onClick={() => speakRussian(speakItem.ru)}>
                      <Volume2 size={18} />
                      音声
                    </button>
                    <button className="good" type="button" onClick={recordSpeakPractice}>
                      <Mic2 size={18} />
                      声に出した
                    </button>
                  </div>
                </div>
              )}
              <button
                className="wide-button secondary"
                type="button"
                onClick={() => {
                  setSpeakOpen(false);
                  setSpeakIndex((index) => (index + 1) % state.items.length);
                }}
              >
                次へ
              </button>
            </div>
          </section>
        )}

        {tab === "wrong" && (
          <section className="mobile-stack">
            <div className="practice-card drill-card">
              <div className="label">間違えたものだけ復習</div>
              {wrongItems.length === 0 ? (
                <div className="empty-state">
                  <Check size={30} />
                  <p>いま復習するミスはありません。</p>
                </div>
              ) : (
                <>
                  <h2>{wrongItem.ja}</h2>
                  <div className="choice-grid">
                    {makeChoices(wrongItem, state.items, "ru").map((choice) => (
                      <button
                        className="choice-button russian-choice"
                        type="button"
                        key={choice}
                        onClick={() => chooseRussian(wrongItem, choice)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  {feedback?.itemId === wrongItem.id && (
                    <div className={`answer-box ${feedback.correct ? "correct" : "wrong"}`}>
                      <strong lang="ru">{wrongItem.ru}</strong>
                      <span>{wrongItem.ja}</span>
                    </div>
                  )}
                  <div className="thumb-row">
                    <button className="good" type="button" onClick={() => clearWrong(wrongItem)}>
                      復習済み
                    </button>
                    <button className="secondary" type="button" onClick={() => speakRussian(wrongItem.ru)}>
                      <Volume2 size={18} />
                      音声
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {tab === "srs" && (
          <section className="two-column">
            <div className="practice-card drill-card">
              <div className="label">SRS 4段階復習</div>
              <h2 lang="ru">{currentSrsItem.ru}</h2>
              <p className="meaning-line">JP: {currentSrsItem.ja}</p>
              <p className="meaning-line">EN: {currentSrsItem.en}</p>
              <button className="wide-button" type="button" onClick={() => speakRussian(currentSrsItem.ru)}>
                <Volume2 size={20} />
                音声を聞く
              </button>
              <div className="grade-grid">
                <button className="bad" type="button" onClick={() => gradeCurrentSrs("again")}>
                  もう一回
                </button>
                <button className="ghost" type="button" onClick={() => gradeCurrentSrs("hard")}>
                  むずかしい
                </button>
                <button className="good" type="button" onClick={() => gradeCurrentSrs("good")}>
                  できた
                </button>
                <button type="button" onClick={() => gradeCurrentSrs("easy")}>
                  簡単
                </button>
              </div>
            </div>
            <aside className="quiet-panel">
              <div className="label">復習予定</div>
              {state.items.slice(0, 12).map((item) => (
                <div className="schedule-row" key={item.id}>
                  <span lang="ru">{item.ru}</span>
                  <b>{formatDue(state.srs[item.id]?.dueAt ?? new Date().toISOString())}</b>
                </div>
              ))}
            </aside>
          </section>
        )}

        {tab === "conversation" && (
          <section className="two-column">
            <div className="practice-card">
              <div className="label">ChatGPT JSON → 復習データ保存</div>
              <textarea
                className="json-textarea"
                value={reviewJson}
                onChange={(event) => setReviewJson(event.target.value)}
                placeholder={
                  '{\n  "date": "2026-07-10",\n  "language": "ru",\n  "level": "A1",\n  "words": [{"ru": "дом", "ja": "家", "en": "house"}],\n  "phrases": [{"ru": "Как дела?", "ja": "元気ですか？"}],\n  "mistakes": [{"bad": "Я играешь.", "good": "Я играю.", "note": "Я は играю"}]\n}'
                }
              />
              <div className="button-row">
                <button type="button" onClick={importDailyReviewJson}>
                  <Download size={18} />
                  JSONを保存
                </button>
              </div>
              {jsonMessage && <div className={`answer-box ${jsonMessage.kind}`}>{jsonMessage.text}</div>}
              <p className="hint-text">
                `date`, `language`, `level`, `words`, `phrases`, `mistakes` を含むJSONを貼り付けます。保存後、単語とフレーズはカード・選択・音声練習に追加されます。
              </p>
              {state.dailyReviews.length > 0 && (
                <div className="review-list">
                  {state.dailyReviews.slice(0, 8).map((review) => (
                    <div className="schedule-row" key={review.id}>
                      <span>
                        {review.date} / {review.level}
                      </span>
                      <b>{review.words.length + review.phrases.length}件</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="practice-card">
              <div className="label">会話ログ → 問題生成</div>
              <textarea
                value={state.conversationLog}
                onChange={(event) => setState((current) => ({ ...current, conversationLog: event.target.value }))}
                placeholder={"例:\nA: Что ты сегодня ел?\nB: Я ел лапшу рамен.\nA: Сегодня было тепло."}
              />
              <div className="button-row">
                <button type="button" onClick={generateFromConversation}>
                  <Sparkles size={18} />
                  問題を生成
                </button>
              </div>
              <p className="hint-text">
                キリル文字の表現を抽出し、重複を避けてカードとクイズに追加します。翻訳は後からカード側で確認してください。
              </p>
            </div>
          </section>
        )}

        {tab === "history" && (
          <section className="practice-card">
            <div className="history-head">
              <div>
                <div className="label">学習履歴</div>
                <h2>
                  <BarChart3 size={24} />
                  {state.history.length} reviews
                </h2>
              </div>
              <button className="secondary" type="button" onClick={downloadHistory}>
                <Download size={18} />
                CSV
              </button>
            </div>
            <div className="history-list">
              {state.history.length === 0 && <p className="hint-text">まだ履歴はありません。</p>}
              {state.history.slice(0, 60).map((entry) => (
                <div className="history-row" key={entry.id}>
                  <span className={entry.correct ? "result-ok" : "result-ng"}>
                    {entry.correct ? "OK" : "NG"}
                  </span>
                  <div>
                    <b lang="ru">{entry.ru}</b>
                    <small>
                      {new Date(entry.reviewedAt).toLocaleString()} / {entry.prompt}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
