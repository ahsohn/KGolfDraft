"use client";

import { useState, useEffect, useRef } from "react";
import { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  mobile?: boolean;
}

// "Veranda" — the chat message list and compose row (the section title is
// rendered by the page / sheet chrome).
export default function Chat({ messages, onSend, mobile = false }: Props) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className={`flex-1 overflow-y-auto scroll-thin flex flex-col min-h-0 ${
          mobile ? "gap-3 text-[15px]" : "gap-2.5 text-sm"
        }`}
      >
        {messages.map((msg) =>
          msg.isSystem ? (
            <div
              key={msg.id}
              className={`text-center text-gold italic font-serif flex-shrink-0 ${
                mobile ? "text-[13px]" : "text-[12.5px]"
              }`}
            >
              — {msg.text} —
            </div>
          ) : (
            <div key={msg.id} className="flex-shrink-0">
              <span className="font-serif font-semibold text-cream">
                {msg.sender}
              </span>{" "}
              <span className="text-cream/40 text-[11px]">
                {formatTime(msg.timestamp)}
              </span>
              <div className="text-cream/75 mt-px">{msg.text}</div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mt-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Compose a remark…"
          className={`flex-1 min-w-0 bg-[rgba(10,43,29,0.6)] border border-gold/30 text-cream placeholder-cream/35 focus:outline-none focus:border-gold ${
            mobile ? "px-3.5 py-3 text-[15px]" : "px-3 py-[9px] text-[13px]"
          }`}
        />
        <button
          type="submit"
          className={`border border-gold text-gold hover:bg-gold/15 tracking-[2px] uppercase ${
            mobile
              ? "px-[18px] min-h-[44px] text-xs"
              : "px-4 py-[9px] text-[11px]"
          }`}
        >
          Send
        </button>
      </form>
    </div>
  );
}
