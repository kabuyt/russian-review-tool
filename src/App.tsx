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
import { gradeSrs, isDue } from "./srs";
import type { HistoryEntry, StoredState, StudyItem, TabId } from "./types";

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

function App() {
  const [tab, setTab] = useState<TabId>("cards");
  const [state, setState] = useState<StoredState>(() => loadState());
  const [cardIndex, setCardIndex] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [listenIndex, setListenIndex] = useState(0);
  const [speakIndex, setSpeakIndex] = useState(0);
  const [speakOpen, setSpeakOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ itemId: string; correct: boolean; value: string } | null>(null);

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
  const wrongItem = wrongItems[0] ?? dueItems[0] ?? state.items[0];
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
