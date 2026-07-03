import { useComments } from '@roomful/react';
import { type FormEvent, type ReactElement, useState } from 'react';

interface CommentTarget {
  id: string;
  label: string;
  blurb: string;
}

const TARGETS: readonly CommentTarget[] = [
  { id: 'hero', label: 'Homepage hero', blurb: 'The headline + call to action.' },
  { id: 'pricing', label: 'Pricing table', blurb: 'Three tiers, annual toggle.' },
  { id: 'onboarding', label: 'Onboarding flow', blurb: 'The first-run checklist.' },
];

export function CommentsApp(): ReactElement {
  const comments = useComments();
  const [activeId, setActiveId] = useState<string>(TARGETS[0]?.id ?? 'hero');
  const [draft, setDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const threads = comments.getByElement(activeId);
  const active = TARGETS.find((target) => target.id === activeId) ?? TARGETS[0];

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = draft.trim();
    if (text === '') {
      return;
    }

    void comments.add({ anchor: { elementId: activeId }, text });
    setDraft('');
  };

  const submitReply = (threadId: string): void => {
    const text = replyDraft.trim();
    if (text === '') {
      return;
    }

    void comments.reply(threadId, text);
    setReplyDraft('');
    setReplyingTo(null);
  };

  return (
    <div className="comments-app">
      <div aria-label="Choose something to review" className="comments-targets" role="tablist">
        {TARGETS.map((target) => {
          const count = comments.getByElement(target.id).length;
          return (
            <button
              aria-selected={target.id === activeId}
              className="comments-target"
              data-active={target.id === activeId}
              key={target.id}
              onClick={() => {
                setActiveId(target.id);
              }}
              role="tab"
              type="button"
            >
              <span className="comments-target__label">{target.label}</span>
              <span className="comments-target__blurb">{target.blurb}</span>
              {count > 0 ? <span className="comments-target__count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="comments-thread">
        <h3 className="comments-thread__head">Comments on {active?.label}</h3>

        <ol className="comments-list">
          {threads.map((thread) => (
            <li className="comment" data-resolved={thread.resolved} key={thread.id}>
              <div className="comment__row">
                <strong className="comment__author">{thread.author.name ?? 'Someone'}</strong>
                <button
                  className="comment__toggle"
                  onClick={() => {
                    if (thread.resolved) {
                      void comments.reopen(thread.id);
                    } else {
                      void comments.resolve(thread.id);
                    }
                  }}
                  type="button"
                >
                  {thread.resolved ? 'Reopen' : 'Resolve'}
                </button>
              </div>
              <p className="comment__text">{thread.text}</p>

              {thread.replies.map((entry) => (
                <p className="comment__reply" key={entry.id}>
                  <strong>{entry.author.name ?? 'Someone'}</strong> {entry.text}
                </p>
              ))}

              {replyingTo === thread.id ? (
                <div className="comment__reply-box">
                  <input
                    aria-label="Reply"
                    autoFocus
                    maxLength={140}
                    onChange={(event) => {
                      setReplyDraft(event.target.value);
                    }}
                    placeholder="Reply…"
                    value={replyDraft}
                  />
                  <button
                    className="button button--primary"
                    onClick={() => {
                      submitReply(thread.id);
                    }}
                    type="button"
                  >
                    Send
                  </button>
                </div>
              ) : (
                <button
                  className="comment__reply-btn"
                  onClick={() => {
                    setReplyDraft('');
                    setReplyingTo(thread.id);
                  }}
                  type="button"
                >
                  Reply
                </button>
              )}
            </li>
          ))}
          {threads.length === 0 ? (
            <li className="comment comment--empty">
              No comments here yet — leave the first one. Threads sync to everyone in the room.
            </li>
          ) : null}
        </ol>

        <form className="comments-add" onSubmit={submit}>
          <input
            aria-label={`Comment on ${active?.label ?? 'this'}`}
            maxLength={140}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="Add a comment…"
            value={draft}
          />
          <button className="button button--primary" type="submit">
            Comment
          </button>
        </form>
      </div>
    </div>
  );
}
