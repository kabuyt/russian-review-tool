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
import { FormEvent, useEffect, useMemo, useState } from "react";
import { mistakes, starterQuizzes } from "./data";
import { extractRussianPhrases, makeGeneratedQuizzes, normalizeAnswer, speakRussian } from "./language";
import { exportHistory, loadState, saveState, createSrsRecord } from "./storage";
import { formatDue, gradeSrs, isDue } from "./srs";
import type { HistoryEntry, QuizItem, StoredState, TabId } from "./types";

const tabs: Array<{ id: TabId; label: string; icon: typeof BookOpen }> = [
  { id: "review", label: "単語", icon: BookOpen },
  { id: "quiz", label: "クイズ", icon: Brain },
  { id: "srs", label: "SRS", icon: RotateCcw },
  { id: "conversation", label: "会話ログ", icon: Sparkles },
  { id: "history", label: "履歴", icon: History },
];

function scoreLabel(correct: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((correct / total) * 100)}%`;
}

function App() {
  const [tab, setTab] = useState<TabId>("review");
  const [state, setState] = useState<StoredState>(() => loadState());
  const [quizIndex, setQuizIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  useEffect(() => {
    saveState(state);
  }, [state]);

  const generatedQuizzes = useMemo(() => makeGeneratedQuizzes(state.items), [state.items]);
  const quizzes = useMemo<QuizItem[]>(() => [...starterQuizzes, ...generatedQuizzes], [generatedQuizzes]);
  const quiz = quizzes[quizIndex % quizzes.length];
  const dueItems = useMemo(
    () => state.items.filter((item) => isDue(state.srs[item.id])).slice(0, 12),
    [state.items, state.srs],
  );
  const currentSrsItem = dueItems[0] ?? state.items[0];
  const correctCount = state.history.filter((entry) => entry.correct).length;
  const todayCount = state.history.filter(
    (entry) => new Date(entry.reviewedAt).toDateString() === new Date().toDateString(),
  ).length;

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

  function checkQuiz(event: FormEvent) {
    event.preventDefault();
    const correct = normalizeAnswer(answer) === normalizeAnswer(quiz.answer);
    setFeedback(correct ? "correct" : "wrong");
    const matched = state.items.find((item) => normalizeAnswer(item.ru) === normalizeAnswer(quiz.answer));
    commitHistory({
      itemId: matched?.id ?? quiz.id,
      ru: quiz.answer,
      prompt: quiz.prompt,
      typedAnswer: answer,
      correct,
    });
  }

  function nextQuiz() {
    setQuizIndex((index) => (index + 1) % quizzes.length);
    setAnswer("");
    setFeedback(null);
  }

  function gradeCurrent(quality: "again" | "hard" | "good" | "easy") {
    const item = currentSrsItem;
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
          prompt: "SRS review",
          typedAnswer: quality,
          correct,
          reviewedAt: new Date().toISOString(),
        },
        ...current.history,
      ].slice(0, 500),
    }));
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
    setTab("quiz");
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
        {tab === "review" && (
          <section className="panel-grid">
            <div className="focus-card">
              <div className="label">今日の3つ</div>
              <div className="pill-row">
                <span className="pill">играю</span>
                <span className="pill">нравится</span>
                <span className="pill">тепло</span>
              </div>
              <p>まずはこの3つだけ覚える。短い表現を音で固める。</p>
            </div>

            <div className="card-list">
              {state.items.map((item, index) => (
                <article className="study-card" key={item.id}>
                  <div className="card-head">
                    <span className="label">Card {index + 1}</span>
                    <span className="source">{item.source === "conversation" ? "log" : "starter"}</span>
                  </div>
                  <h2 lang="ru">{item.ru}</h2>
                  <p>JP: {item.ja}</p>
                  <p>EN: {item.en}</p>
                  <div className="button-row">
                    <button type="button" onClick={() => speakRussian(item.ru)} title="音声で聞く">
                      <Volume2 size={18} />
                      音声
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setOpenCards((open) => ({ ...open, [item.id]: !open[item.id] }))}
                    >
                      <Mic2 size={18} />
                      例文
                    </button>
                  </div>
                  {openCards[item.id] && (
                    <div className="answer-box">
                      声に出して3回読む:
                      <strong lang="ru">{item.ru}</strong>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "quiz" && (
          <section className="two-column">
            <form className="practice-card" onSubmit={checkQuiz}>
              <div className="label">英語 / 日本語 → ロシア語</div>
              <h2>{quiz.prompt}</h2>
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="ロシア語で入力..."
                autoCapitalize="none"
                spellCheck={false}
              />
              <div className="button-row">
                <button type="submit">
                  <Check size={18} />
                  確認
                </button>
                <button className="secondary" type="button" onClick={nextQuiz}>
                  <RotateCcw size={18} />
                  次へ
                </button>
                <button className="ghost" type="button" onClick={() => speakRussian(quiz.answer)}>
                  <Volume2 size={18} />
                  正解音声
                </button>
              </div>
              {feedback && (
                <div className={`answer-box ${feedback}`}>
                  {feedback === "correct" ? "Отлично!" : "もう少し。正解:"}
                  <strong lang="ru">{quiz.answer}</strong>
                  {quiz.hint && <small>Hint: {quiz.hint}</small>}
                </div>
              )}
            </form>

            <aside className="quiet-panel">
              <div className="label">今日のミス</div>
              {mistakes.map((mistake) => (
                <div className="mistake" key={mistake.title}>
                  <b>{mistake.title}</b>
                  <p lang="ru">
                    <X size={16} /> {mistake.bad}
                  </p>
                  <p lang="ru">
                    <Check size={16} /> {mistake.good}
                  </p>
                  <small>{mistake.note}</small>
                </div>
              ))}
            </aside>
          </section>
        )}

        {tab === "srs" && (
          <section className="two-column">
            <div className="practice-card">
              <div className="label">間隔反復</div>
              <h2 lang="ru">{currentSrsItem.ru}</h2>
              <p>
                JP: {currentSrsItem.ja} / EN: {currentSrsItem.en}
              </p>
              <div className="button-row">
                <button type="button" onClick={() => speakRussian(currentSrsItem.ru)}>
                  <Volume2 size={18} />
                  音声
                </button>
              </div>
              <div className="grade-grid">
                <button className="bad" type="button" onClick={() => gradeCurrent("again")}>
                  Again
                </button>
                <button className="ghost" type="button" onClick={() => gradeCurrent("hard")}>
                  Hard
                </button>
                <button className="good" type="button" onClick={() => gradeCurrent("good")}>
                  Good
                </button>
                <button type="button" onClick={() => gradeCurrent("easy")}>
                  Easy
                </button>
              </div>
            </div>
            <aside className="quiet-panel">
              <div className="label">次回復習</div>
              {state.items.slice(0, 10).map((item) => (
                <div className="schedule-row" key={item.id}>
                  <span lang="ru">{item.ru}</span>
                  <b>{formatDue(state.srs[item.id]?.dueAt ?? new Date().toISOString())}</b>
                </div>
              ))}
            </aside>
          </section>
        )}

        {tab === "conversation" && (
          <section className="practice-card">
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
