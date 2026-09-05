import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../api";

const LINE_HEIGHT_PX = 18;
const MAX_LINES = 5;
const MAX_HEIGHT_PX = LINE_HEIGHT_PX * MAX_LINES;

export function Chat({
  messages,
  busy,
  onSend,
}: {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  // grows with content up to MAX_LINES, then the textarea itself scrolls.
  // overflow only turns on once content actually exceeds the cap, otherwise
  // a 1-line textarea shows a spurious scrollbar from rounding.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const overflowing = el.scrollHeight > MAX_HEIGHT_PX;
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    el.style.overflowY = overflowing ? "auto" : "hidden";
  }, [text]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  }

  return (
    <div className="chat">
      <h2>Shopping Assistant</h2>
      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg-${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="chat-msg chat-msg-assistant chat-msg-loading">thinking…</div>}
      </div>
      <form className="chat-input-row" onSubmit={submit}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. I need a drill and some paint"
          disabled={busy}
          rows={1}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
