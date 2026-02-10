"use client";

import { useState, useEffect, useRef } from "react";
import { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export default function Chat({ messages, onSend }: Props) {
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
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-2 px-1">Chat</h2>

      <div className="flex-1 overflow-y-auto scroll-thin bg-green-950/50 rounded-lg p-2 space-y-1 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            {msg.isSystem ? (
              <p className="text-green-400 italic">
                <span className="text-green-600 text-xs mr-1">
                  {formatTime(msg.timestamp)}
                </span>
                {msg.text}
              </p>
            ) : (
              <p>
                <span className="text-green-600 text-xs mr-1">
                  {formatTime(msg.timestamp)}
                </span>
                <span className="font-semibold text-green-300">
                  {msg.sender}:
                </span>{" "}
                <span className="text-white">{msg.text}</span>
              </p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 rounded bg-green-950 border border-green-700 text-white placeholder-green-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
