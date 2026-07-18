import React from 'react';

interface RichMessageProps {
  content: string;
  role: string;
}

export function RichMessage({ content, role }: RichMessageProps) {
  // If it's a raw JSON string, pretty print it
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return <JsonView data={parsed} />;
    } catch {
      // fall through to text formatting
    }
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (currentList) {
      elements.push(
        <ul key={key++} className="list-disc pl-4 space-y-1 mb-2">
          {currentList.map((item, i) => (
            <li key={i} className="text-sm">{formatInline(item.replace(/^[-*]\s*/, '').trim())}</li>
          ))}
        </ul>
      );
      currentList = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/^\s+/, '');

    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-text-primary mt-3 mb-1">{line.replace('### ', '')}</h3>
      );
      continue;
    }

    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-base font-semibold text-text-primary mt-4 mb-2 border-b border-border pb-1">{line.replace('## ', '')}</h2>
      );
      continue;
    }

    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={key++} className="text-lg font-bold text-text-primary mt-4 mb-2">{line.replace('# ', '')}</h1>
      );
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!currentList) currentList = [];
      currentList.push(line);
      continue;
    }

    if (line.startsWith('**') && line.endsWith('**')) {
      flushList();
      elements.push(
        <p key={key++} className="text-sm font-semibold text-text-primary mt-2 mb-1">{line.replace(/\*\*/g, '')}</p>
      );
      continue;
    }

    if (line.startsWith('**') && line.includes('**:')) {
      flushList();
      const [bold, ...rest] = line.split(':');
      const label = bold.replace(/\*\*/g, '').trim();
      const value = rest.join(':').trim();
      elements.push(
        <p key={key++} className="text-sm mb-1">
          <span className="font-semibold text-text-primary">{label}:</span>{' '}
          {formatInline(value)}
        </p>
      );
      continue;
    }

    if (line === '') {
      flushList();
      continue;
    }

    if (line.startsWith('```')) {
      flushList();
      continue;
    }

    if (line.startsWith('Source:') || line.startsWith('Sources:')) {
      flushList();
      elements.push(
        <div key={key++} className="text-xs text-text-secondary mt-1 mb-2">
          {formatInline(line)}
        </div>
      );
      continue;
    }

    flushList();
    elements.push(
      <p key={key++} className="text-sm mb-1.5 leading-relaxed">{formatInline(line)}</p>
    );
  }

  flushList();

  const isUser = role === 'user';
  const baseClass = isUser
    ? 'bg-primary text-white rounded-tr-sm'
    : role === 'tool'
    ? 'bg-surface text-text-secondary text-xs font-mono rounded-tl-sm'
    : role === 'thought'
    ? 'bg-amber-50 text-amber-800 text-xs italic rounded-tl-sm border border-amber-200'
    : 'bg-surface text-text-primary rounded-tl-sm border border-border';

  return <div className={`text-sm p-4 rounded-2xl max-w-[85%] ${baseClass}`}>{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    // Link
    if (part.match(/^https?:\/\/\S+$/)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary-hover">
          {part.length > 40 ? part.slice(0, 40) + '…' : part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function JsonView({ data }: { data: unknown }) {
  return (
    <pre className="text-xs font-mono p-3 rounded-lg bg-surface border border-border overflow-x-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
