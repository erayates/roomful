export type DomChild = Node | string | null | undefined;

export interface ElementOptions {
  readonly attributes?: Record<string, string | undefined>;
  readonly className?: string;
  readonly text?: string;
}

function appendChild(parent: Node, child: DomChild): void {
  if (child === null || child === undefined) {
    return;
  }

  if (typeof child === 'string') {
    parent.appendChild(document.createTextNode(child));
    return;
  }

  parent.appendChild(child);
}

export function appendChildren(parent: Node, children: readonly DomChild[]): void {
  for (const child of children) {
    appendChild(parent, child);
  }
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: ElementOptions = {},
  children: readonly DomChild[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text) {
    element.textContent = options.text;
  }

  if (options.attributes) {
    for (const [name, value] of Object.entries(options.attributes)) {
      if (value === undefined) {
        continue;
      }

      element.setAttribute(name, value);
    }
  }

  appendChildren(element, children);
  return element;
}

export function createBadge(text: string, tone: string): HTMLSpanElement {
  return createElement(
    'span',
    {
      attributes: {
        'data-tone': tone,
      },
      className: 'flock-badge',
      text,
    },
    [],
  );
}

export function replaceChildren(parent: HTMLElement, child: Node): void {
  parent.replaceChildren(child);
}
