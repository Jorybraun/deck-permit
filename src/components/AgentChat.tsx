import { useState, useRef, useEffect } from 'react';
import { Bot, CheckCircle2, ExternalLink, Send, Sparkles, X } from 'lucide-react';
import { useStore } from '../state/store';
import { runAgentTurn, executeTool, type AgentMessage, type AgentAction } from '../services/agent';
import { downloadPrintablePackage } from '../services/printablePackage';
import { directToolFor, isToolFailure } from '../services/chatIntent';

export function AgentChat({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      role: 'agent',
      content: "I’ll research the property, verify the local rules, and keep your design permit-ready as we work. What address are we building at?",
      actions: [
        { label: 'Use pilot address', value: '2423 Lovell Ave, Sidney BC' },
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY as string | undefined;

  const property = useStore((s) => s.property);
  const deck = useStore((s) => s.deck);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const addMessage = (msg: AgentMessage) => {
    setMessages((m) => [...m, msg]);
  };

  const runTurn = async (userMsg: string) => {
    const directTool = directToolFor(userMsg);
    if (directTool) {
      setError(null);
      setLoading(true);
      addMessage({ role: 'tool', content: toolProgressLabel(directTool.tool) });
      try {
        const result = await executeTool(directTool);
        const failed = isToolFailure(result);
        if (failed) {
          const detail = result.replace(/^Tool error:\s*/i, '');
          setError(detail);
          addMessage({ role: 'agent', content: `I couldn't complete that action: ${detail}` });
          return;
        }
        if (directTool.tool === 'lookup_property' && useStore.getState().property.parcel) {
          useStore.getState().setStep('lot');
        }
        addMessage({
          role: 'agent',
          content: directTool.tool === 'lookup_property'
            ? `${result} I loaded the municipal parcel and roofline evidence into the site plan. Review the source confidence and lot facts, then we can design the deck.`
            : result,
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!apiKey) {
      setError('AI conversation needs a Cerebras API key. Address lookup and core project actions still work without one.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const history = [...messages];
      let turn = await runAgentTurn(userMsg, history, apiKey);
      let toolRounds = 0;

      while (turn.toolCalls && turn.toolCalls.length > 0) {
        toolRounds += 1;
        if (toolRounds > 8) throw new Error('The agent reached its action limit. Review the project and send the next instruction.');
        const results: AgentMessage[] = [];
        for (const toolCall of turn.toolCalls) {
          addMessage({ role: 'tool', content: humanizeTool(toolCall.tool) });
          const result = await executeTool(toolCall);
          if (isToolFailure(result)) throw new Error(result.replace(/^Tool error:\s*/i, ''));
          const resultMessage = { role: 'tool' as const, content: result, toolName: toolCall.tool };
          results.push(resultMessage);
          addMessage(resultMessage);
        }

        const followUpHistory = [
          ...messages,
          { role: 'user' as const, content: userMsg },
          { role: 'agent' as const, content: turn.response, actions: turn.actions },
          ...results,
        ];
        turn = await runAgentTurn('What did you learn? Summarize for the user.', followUpHistory, apiKey);
      }

      addMessage({ role: 'agent', content: turn.response || 'Done.', actions: turn.actions });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(detail);
      addMessage({ role: 'agent', content: `I couldn't complete that action: ${detail}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMsg });
    await runTurn(userMsg);
  };

  const handleAction = async (action: AgentAction) => {
    if (loading) return;
    setInput('');
    addMessage({ role: 'user', content: action.label });
    await runTurn(action.value);
  };

  const handleExport = () => {
    if (!deck || !property.address) return;
    const state = useStore.getState();
    const permitPackage = state.planset ? null : state.issueDrawingPackage();
    const sheets = useStore.getState().planset || permitPackage?.sheets;
    if (sheets) downloadPrintablePackage(property, sheets);
  };

  const suggestions = [
    '2423 Lovell Ave, Sidney BC',
    'Make it a 12x16 cedar deck 2 feet high with stairs',
    'Move the deck 1.25 m from the start of the south wall',
    'Run the code check',
    'Generate the permit plans',
    'Start over',
  ];

  function msgClass(role: string): string {
    if (role === 'user') return 'agent-message-user';
    if (role === 'tool') return 'agent-message-tool';
    return 'agent-message-assistant';
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="agent-header">
        <div className="agent-avatar"><Sparkles size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2>Permit agent</h2>
            <span className="agent-online"><span /> Online</span>
          </div>
          <p>Researches, designs, and checks as you work</p>
        </div>
        {onClose && (
          <button className="icon-button" onClick={onClose} aria-label="Close permit agent"><X size={18} /></button>
        )}
      </div>

      <div className="agent-context-bar">
        <Bot size={15} />
        <span>Agent actions update your project</span>
        <CheckCircle2 size={14} className="ml-auto text-emerald-600" />
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'user' ? 'flex flex-col gap-2 items-end' : 'flex flex-col gap-2 items-start'}
          >
            <div className={'agent-message max-w-[92%] ' + msgClass(msg.role)}>
              {msg.role === 'tool' && <CheckCircle2 size={13} className="mt-0.5 shrink-0" />}
              <span>{msg.content}</span>
            </div>
            {msg.role === 'agent' && msg.actions && msg.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-1 max-w-[85%]">
                {msg.actions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAction(action)}
                    disabled={loading}
                  className="agent-action"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex flex-col gap-2 items-start">
            <div className="agent-message agent-message-assistant max-w-[85%]">
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '75ms' }} />
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              </span>
            </div>
          </div>
        )}
        {error && (
          <div className="agent-error">
            <span>{error}</span>
            <span>You can still use the guided project controls.</span>
          </div>
        )}
        <div ref={bottomRef} />

        {messages.length <= 2 && (
          <div className="pt-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleAction({ label: s, value: s })}
                  disabled={loading}
                  className="agent-suggestion"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {deck && (
        <div className="px-4 py-3 border-t border-line bg-white">
          <button
            onClick={handleExport}
            className="secondary-button w-full"
          >
            <ExternalLink size={15} /> Export permit package
          </button>
        </div>
      )}

      <div className="agent-composer-wrap">
        <div className="agent-composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !loading) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about rules or change the design…"
            rows={2}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="send-button"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <p>Agent output is guidance. Confirm final plans with your municipality.</p>
      </div>
    </div>
  );
}

function humanizeTool(tool: string): string {
  const labels: Record<string, string> = {
    lookup_property: 'Property and parcel data loaded',
    research_permit_requirements: 'Municipal permit requirements researched',
    web_search: 'Official sources searched',
    fetch_url: 'Official source reviewed',
    create_deck: 'Deck design updated on canvas',
    adjust_deck: 'Deck dimensions updated',
    set_decking: 'Decking finish updated',
    set_guard: 'Railing system updated',
    run_compliance: 'Code and zoning checks completed',
    generate_plan_set: 'Permit drawing set generated',
  };
  return labels[tool] || tool.replace(/_/g, ' ');
}

function toolProgressLabel(tool: string): string {
  const labels: Record<string, string> = {
    lookup_property: 'Looking up the address, parcel, and municipal rooflines…',
    create_deck: 'Creating the parametric deck model…',
    adjust_deck: 'Updating the parametric deck geometry…',
    set_decking: 'Updating the deck finish…',
    set_guard: 'Updating the railing system…',
    run_compliance: 'Running code and zoning checks…',
    generate_plan_set: 'Generating the coordinated permit drawings…',
    reset_session: 'Resetting the project…',
  };
  return labels[tool] || `Running ${tool.replace(/_/g, ' ')}…`;
}
