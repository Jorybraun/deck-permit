import { useState, useRef, useEffect } from 'react';
import { answerCodeQuestion } from '../services/aiProvider';

interface HelpRailProps {
  onClose: () => void;
}

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function HelpRail({ onClose }: HelpRailProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Ask me about deck building codes, BCBC requirements, or why something was flagged.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY as string | undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (!apiKey) {
      setError('Cerebras key not configured. Add VITE_CEREBRAS_API_KEY to .env.local.');
      return;
    }

    const userMsg = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: userMsg }]);
    setLoading(true);
    setError(null);

    const { text, error: aiError } = await answerCodeQuestion(userMsg, apiKey);
    setLoading(false);

    if (aiError) {
      setError(aiError);
    } else {
      setMessages((m) => [...m, { role: 'assistant', content: text }]);
    }
  };

  const suggestions = [
    'Why do I need a guard?',
    'What is the BCBC post size rule?',
    'When is an engineer required?',
    'How deep do footings need to be?',
  ];

  return (
    <div className="w-80 border-l border-border bg-white flex flex-col overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">AI Help</h3>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-lg">
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-primary text-white ml-8'
                : 'bg-surface text-text-primary mr-8'
            }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="text-sm p-3 rounded-lg bg-surface text-text-secondary mr-8">
            <span className="inline-block w-2 h-2 bg-text-secondary rounded-full animate-pulse" />
          </div>
        )}
        {error && <p className="text-xs text-danger p-2">{error}</p>}
        <div ref={bottomRef} />

        {messages.length === 1 && (
          <div className="pt-2 space-y-2">
            <p className="text-xs text-text-secondary">Try asking:</p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="block w-full text-left text-xs text-primary hover:underline"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleSend()}
            placeholder="Ask about BCBC rules..."
            className="flex-1 px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || !apiKey}
            className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
