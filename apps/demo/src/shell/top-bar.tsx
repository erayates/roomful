import { type ReactElement, useEffect, useState } from 'react';

import type { MiniAppDefinition } from '../apps/registry';
import { sanitizeDisplayName } from '../demo-identity';
import { DEMO_PALETTE } from '../demo-palette';
import type { DemoIdentity } from '../demo-types';

interface TopBarProps {
  apps: readonly MiniAppDefinition[];
  activeAppId: string;
  identity: DemoIdentity;
  onIdentityChange: (identity: DemoIdentity) => void;
  onSelectApp: (id: string) => void;
  shareUrl: string;
}

export function TopBar({
  apps,
  activeAppId,
  identity,
  onIdentityChange,
  onSelectApp,
  shareUrl,
}: TopBarProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftName, setDraftName] = useState(identity.name);

  useEffect(() => {
    setDraftName(identity.name);
  }, [identity.name]);

  const saveName = (): void => {
    onIdentityChange({ ...identity, name: sanitizeDisplayName(draftName) });
    setEditing(false);
  };

  const copyLink = (): void => {
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1_600);
    });
  };

  return (
    <header className="topbar">
      <a className="topbar__brand" href="https://roomful.dev" rel="noreferrer" target="_blank">
        <img alt="" height="28" src="/roomful-mark.svg" width="28" />
        <span>
          Roomful <em>Playground</em>
        </span>
      </a>

      <nav aria-label="Mini apps" className="topbar__nav">
        {apps.map((app) => (
          <button
            aria-current={app.id === activeAppId ? 'page' : undefined}
            className="topbar__tab"
            key={app.id}
            onClick={() => {
              onSelectApp(app.id);
            }}
            type="button"
          >
            <span aria-hidden="true">{app.icon}</span> {app.title}
          </button>
        ))}
      </nav>

      <div className="topbar__right">
        <button
          className="topbar__identity"
          onClick={() => {
            setEditing((value) => !value);
          }}
          type="button"
        >
          <span className="topbar__swatch" style={{ backgroundColor: identity.color }} />
          {identity.name}
        </button>
        <button className="button button--ghost" onClick={copyLink} type="button">
          {copied ? 'Copied!' : 'Copy invite'}
        </button>
        <button
          className="button button--primary"
          onClick={() => {
            window.open(window.location.href, '_blank', 'noopener');
          }}
          type="button"
        >
          Open 2nd tab →
        </button>
      </div>

      {editing ? (
        <div aria-label="Edit your identity" className="identity-pop" role="dialog">
          <label htmlFor="pg-name">Display name</label>
          <input
            id="pg-name"
            maxLength={24}
            onChange={(event) => {
              setDraftName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                saveName();
              }
            }}
            value={draftName}
          />
          <div className="identity-pop__colors">
            {DEMO_PALETTE.map((swatch) => (
              <button
                aria-label={`Use ${swatch}`}
                aria-pressed={swatch === identity.color}
                className="swatch"
                key={swatch}
                onClick={() => {
                  onIdentityChange({ ...identity, color: swatch });
                }}
                style={{ backgroundColor: swatch }}
                type="button"
              />
            ))}
          </div>
          <button className="button button--primary" onClick={saveName} type="button">
            Save
          </button>
        </div>
      ) : null}
    </header>
  );
}
