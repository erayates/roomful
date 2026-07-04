import './styles.css';

import type {
  AwarenessState,
  CommentsEngine,
  CommentThread,
  Peer,
  PresenceData,
  Room,
  Unsubscribe,
} from '@roomful/core';
import { createRoom } from '@roomful/core';

interface EditorPresence extends PresenceData {
  color?: string;
  name?: string;
}

let room: Room<EditorPresence> | null = null;
let comments: CommentsEngine | null = null;
let subscriptions: Unsubscribe[] = [];
let awarenessTypingTimer: number | null = null;
let applyingRemoteText = false;

const roomInput = getElement('room-id', HTMLInputElement);
const nameInput = getElement('name', HTMLInputElement);
const colorInput = getElement('color', HTMLInputElement);
const connectButton = getElement('connect', HTMLButtonElement);
const statusText = getElement('status', HTMLElement);
const editor = getElement('editor', HTMLTextAreaElement);
const peerList = getElement('peers', HTMLUListElement);
const awarenessList = getElement('awareness', HTMLUListElement);
const commentInput = getElement('comment-input', HTMLInputElement);
const addCommentButton = getElement('add-comment', HTMLButtonElement);
const commentList = getElement('comments', HTMLOListElement);

function getElement<TElement extends HTMLElement>(
  id: string,
  ElementConstructor: new () => TElement,
): TElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new TypeError(`Missing example element: #${id}.`);
  }

  if (!(element instanceof ElementConstructor)) {
    throw new TypeError(`Unexpected example element type: #${id}.`);
  }

  return element;
}

function setStatus(value: string): void {
  statusText.textContent = value;
}

function renderPeers(peers: Peer<EditorPresence>[]): void {
  peerList.replaceChildren();

  if (peers.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No peers connected.';
    peerList.append(empty);
    return;
  }

  for (const peer of peers) {
    const item = document.createElement('li');
    item.textContent = peer.name ?? peer.id;
    item.style.borderColor = typeof peer.color === 'string' ? peer.color : '#ccd6f2';
    peerList.append(item);
  }
}

function renderAwareness(states: AwarenessState[]): void {
  awarenessList.replaceChildren();

  if (states.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No awareness state yet.';
    awarenessList.append(empty);
    return;
  }

  for (const state of states) {
    const item = document.createElement('li');
    const name = typeof state.name === 'string' ? state.name : state.peerId;
    const typing = state.typing === true ? 'typing' : 'idle';
    const focused = state.focused === true ? 'focused' : 'blurred';
    item.textContent = `${name}: ${typing}, ${focused}`;
    awarenessList.append(item);
  }
}

function renderComments(threads: CommentThread[]): void {
  commentList.replaceChildren();

  if (threads.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No comments yet.';
    commentList.append(empty);
    return;
  }

  for (const thread of threads) {
    const item = document.createElement('li');
    item.className = 'comment';
    if (thread.resolved) {
      item.dataset.resolved = 'true';
    }

    const anchor = thread.anchor;
    if ('from' in anchor && 'to' in anchor) {
      const quote = editor.value.slice(anchor.from, anchor.to).trim();
      if (quote.length > 0) {
        const blockquote = document.createElement('blockquote');
        blockquote.textContent = quote;
        item.append(blockquote);
      }
    }

    const body = document.createElement('p');
    body.className = 'comment__body';
    const author = document.createElement('strong');
    author.textContent = thread.author.name ?? thread.author.id;
    body.append(author, ` ${thread.text}`);
    item.append(body);

    for (const reply of thread.replies) {
      const replyEl = document.createElement('p');
      replyEl.className = 'comment__reply';
      const replyAuthor = document.createElement('strong');
      replyAuthor.textContent = reply.author.name ?? reply.author.id;
      replyEl.append(replyAuthor, ` ${reply.text}`);
      item.append(replyEl);
    }

    const actions = document.createElement('div');
    actions.className = 'comment__actions';

    const replyInput = document.createElement('input');
    replyInput.placeholder = 'Reply…';
    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.textContent = 'Reply';
    replyButton.addEventListener('click', () => {
      const text = replyInput.value.trim();
      if (text.length === 0) {
        return;
      }

      void comments?.thread(thread.id).reply(text);
      replyInput.value = '';
    });

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.textContent = thread.resolved ? 'Reopen' : 'Resolve';
    toggleButton.addEventListener('click', () => {
      if (thread.resolved) {
        void comments?.thread(thread.id).reopen();
      } else {
        void comments?.thread(thread.id).resolve();
      }
    });

    actions.append(replyInput, replyButton, toggleButton);
    item.append(actions);
    commentList.append(item);
  }
}

async function disconnectRoom(): Promise<void> {
  const currentRoom = room;
  subscriptions.forEach((unsubscribe) => unsubscribe());
  subscriptions = [];
  room = null;
  comments = null;

  if (currentRoom) {
    await currentRoom.disconnect();
  }
}

async function connectRoom(): Promise<void> {
  await disconnectRoom();

  const nextRoom = createRoom<EditorPresence>(
    roomInput.value.trim() || 'collaborative-editor-room',
    {
      presence: {
        color: colorInput.value,
        name: nameInput.value.trim() || 'Editor peer',
      },
      transport: 'broadcast',
    },
  );
  const presence = nextRoom.usePresence();
  const awareness = nextRoom.useAwareness();
  // Durable, anchored comment threads backed by local storage (survive a reload).
  const nextComments = nextRoom.useComments({ storage: 'indexeddb' });
  const text = nextRoom.getYDoc().getText('document');

  const syncFromText = (): void => {
    const nextValue = text.toJSON();
    if (editor.value === nextValue) {
      return;
    }

    applyingRemoteText = true;
    editor.value = nextValue;
    applyingRemoteText = false;
  };

  text.observe(syncFromText);
  room = nextRoom;
  comments = nextComments;
  subscriptions = [
    () => {
      text.unobserve(syncFromText);
    },
    presence.subscribe(renderPeers),
    awareness.subscribe(renderAwareness),
    nextComments.subscribe(renderComments),
    nextRoom.getYProvider().on('sync', ({ synced }) => {
      setStatus(synced ? `synced as ${nextRoom.peerId}` : 'syncing');
      syncFromText();
    }),
    nextRoom.on('connected', () => {
      setStatus(`connected as ${nextRoom.peerId}`);
      renderPeers(presence.getAll());
      renderAwareness(awareness.getAll());
      syncFromText();
    }),
    nextRoom.on('disconnected', () => {
      setStatus('disconnected');
      renderPeers([]);
      renderAwareness([]);
    }),
    nextRoom.on('error', (error) => {
      setStatus(error.message);
    }),
  ];

  setStatus('connecting');
  await nextRoom.connect();
}

function replaceSharedText(value: string): void {
  if (!room || applyingRemoteText) {
    return;
  }

  const text = room.getYDoc().getText('document');
  room.getYDoc().transact(() => {
    text.delete(0, text.length);
    text.insert(0, value);
  });
}

function setTyping(value: boolean): void {
  const currentRoom = room;
  if (!currentRoom) {
    return;
  }

  currentRoom.useAwareness().set({
    focused: document.activeElement === editor,
    typing: value,
  });
}

connectButton.addEventListener('click', () => {
  void connectRoom();
});
editor.addEventListener('input', () => {
  replaceSharedText(editor.value);
  setTyping(true);

  if (awarenessTypingTimer !== null) {
    window.clearTimeout(awarenessTypingTimer);
  }

  awarenessTypingTimer = window.setTimeout(() => {
    setTyping(false);
  }, 900);
});
editor.addEventListener('focus', () => {
  setTyping(false);
});
editor.addEventListener('blur', () => {
  setTyping(false);
});
addCommentButton.addEventListener('click', () => {
  const currentComments = comments;
  if (!currentComments) {
    return;
  }

  const text = commentInput.value.trim();
  if (text.length === 0) {
    return;
  }

  // Anchor to the current selection (a zero-width range for a document-level note).
  void currentComments.add({
    anchor: { from: editor.selectionStart, to: editor.selectionEnd, elementId: 'editor' },
    text,
  });
  commentInput.value = '';
});

renderPeers([]);
renderAwareness([]);
renderComments([]);
