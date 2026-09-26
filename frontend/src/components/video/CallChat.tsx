import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../types/consultation';

export interface CallChatProps {
  messages: ChatMessage[];
  selfConnectionId?: string | null;
  onSend: (text: string) => void;
  onClose: () => void;
}

/**
 * Consultation chat.
 *
 * Not persisted anywhere. Consultation chat is working talk - "can you step back a
 * little", "I have lost your audio" - and keeping it would turn it into a medical record
 * nobody agreed to create. Clinical notes are a separate, explicit field the clinician
 * writes on purpose.
 */
export function CallChat({ messages, selfConnectionId, onSend, onClose }: CallChatProps) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation. Without this a message that arrives while the clinician is
  // typing lands below the fold and is missed.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 320,
        background: '#0f172a',
        borderLeft: '1px solid #1e293b',
        height: '100%',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <strong style={{ color: '#e2e8f0', fontSize: 14 }}>Chat</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10 }}>
        {messages.length === 0 && (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Messages here are not saved after the consultation ends.
          </p>
        )}
        {messages.map((message, index) => {
          const isSelf = message.connectionId === selfConnectionId;
          return (
            <div
              key={`${message.at}-${index}`}
              style={{
                justifySelf: isSelf ? 'end' : 'start',
                maxWidth: '85%',
                background: isSelf ? '#0e7490' : '#1e293b',
                color: '#f1f5f9',
                padding: '8px 10px',
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              {!isSelf && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                  {message.userName}
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {message.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #1e293b' }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message"
          maxLength={2000}
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            color: '#f1f5f9',
            padding: '8px 10px',
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          style={{
            background: draft.trim() ? '#0e7490' : '#334155',
            border: 'none',
            borderRadius: 8,
            color: '#f1f5f9',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Send
        </button>
      </form>
    </aside>
  );
}

export default CallChat;
