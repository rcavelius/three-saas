"use client";
/**
 * Chat assistant widget. Talks only to /api/support/chat (same origin, so CSP connect-src 'self' holds).
 * Replies are announced through an aria-live log; "Talk to a person" prefills the ticket form on the page
 * (#sup-ticket-form), which also works without JavaScript.
 */
import { useRef, useState, type FormEvent } from "react";

interface Link {
  slug: string;
  title: string;
  url: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  mode?: "ai" | "fallback";
  citations?: Link[];
  articles?: Link[];
  suggestTicket?: boolean;
  note?: string;
}

const MAX = 2000;

export function SupportChat({ assistantName = "Help assistant" }: { assistantName?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    if (message.length > MAX) {
      setError(`Please keep questions under ${MAX} characters.`);
      return;
    }
    setError(null);
    setBusy(true);
    const history = turns.slice(-6).map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: message }]);
    setInput("");
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await res.json().catch(() => null)) as {
        mode?: "ai" | "fallback";
        answer?: string | null;
        citations?: Link[];
        articles?: Link[];
        suggestTicket?: boolean;
        fallbackReason?: string;
        message?: string;
      } | null;
      if (!res.ok || !data) {
        setError(data?.message ?? "Something went wrong. Please try again, or contact a person below.");
        setTurns((t) => t.slice(0, -1));
        setInput(message);
        return;
      }
      setTurns((t) => [
        ...t,
        data.mode === "ai" && data.answer
          ? { role: "assistant", content: data.answer, mode: "ai", citations: data.citations ?? [], articles: data.articles ?? [], suggestTicket: data.suggestTicket }
          : {
              role: "assistant",
              content: data.fallbackReason ?? "These articles may help.",
              mode: "fallback",
              articles: data.articles ?? [],
              suggestTicket: true,
            },
      ]);
    } catch {
      setError("Could not reach the assistant. Check your connection, or contact a person below.");
      setTurns((t) => t.slice(0, -1));
      setInput(message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function talkToPerson() {
    const questions = turns.filter((t) => t.role === "user").map((t) => t.content);
    const subject = document.getElementById("sup-subject") as HTMLInputElement | null;
    const body = document.getElementById("sup-message") as HTMLTextAreaElement | null;
    const source = document.getElementById("sup-source") as HTMLInputElement | null;
    if (subject && !subject.value && questions[0]) subject.value = questions[0].slice(0, 120);
    if (body && !body.value && questions.length) body.value = questions.join("\n\n").slice(0, 5000);
    if (source) source.value = "chat";
    const form = document.getElementById("sup-ticket-form");
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
    (document.getElementById("sup-email") ?? subject)?.focus();
  }

  return (
    <div className="sup-chat">
      <div className="sup-chat-log" role="log" aria-live="polite" aria-relevant="additions" aria-label={`${assistantName} conversation`}>
        {turns.length === 0 && (
          <p className="sup-muted">
            Ask a question about your account, billing or how something works. Answers come from our help articles; the assistant
            cannot see or change your account.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`sup-bubble sup-bubble-${t.role}`}>
            <p className="sup-bubble-who">{t.role === "user" ? "You" : assistantName}</p>
            <p className="sup-bubble-text">{t.content}</p>
            {t.citations && t.citations.length > 0 && (
              <p className="sup-meta">
                Sources:{" "}
                {t.citations.map((c, j) => (
                  <span key={c.slug}>
                    {j > 0 ? ", " : ""}
                    <a href={c.url}>{c.title}</a>
                  </span>
                ))}
              </p>
            )}
            {t.articles && t.articles.length > 0 && (
              <div>
                <p className="sup-meta">{t.mode === "fallback" ? "These articles may help:" : "Related:"}</p>
                <ul className="sup-links">
                  {t.articles.map((a) => (
                    <li key={a.slug}>
                      <a href={a.url}>{a.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {t.role === "assistant" && t.suggestTicket && (
              <button type="button" className="sup-button sup-button-secondary" onClick={talkToPerson}>
                Talk to a person
              </button>
            )}
          </div>
        ))}
        {busy && <p className="sup-muted">Looking that up…</p>}
      </div>
      {error && (
        <p className="sup-notice sup-notice-error" role="alert">
          {error}
        </p>
      )}
      <form className="sup-chat-form" onSubmit={send}>
        <label htmlFor="sup-chat-input" className="sup-label">
          Your question
        </label>
        <textarea
          id="sup-chat-input"
          ref={inputRef}
          className="sup-input"
          rows={2}
          maxLength={MAX}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(e as unknown as FormEvent);
            }
          }}
          aria-describedby="sup-chat-hint"
        />
        <p id="sup-chat-hint" className="sup-hint">
          Enter to send, Shift+Enter for a new line. Don&apos;t share passwords or card numbers.
        </p>
        <div className="sup-row">
          <button type="submit" className="sup-button" disabled={busy} aria-busy={busy}>
            {busy ? "Sending…" : "Ask"}
          </button>
          <button type="button" className="sup-button sup-button-secondary" onClick={talkToPerson}>
            Talk to a person
          </button>
        </div>
      </form>
    </div>
  );
}
