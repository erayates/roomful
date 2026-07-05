/**
 * Hash-chained audit log for tamper evidence.
 *
 * Each entry links to the previous via a hash, so altering any entry
 * breaks the chain. Call `verify()` to detect tampering.
 *
 * ponytail: djb2 hash — fast, sync, no crypto dep. Not collision-resistant;
 * upgrade to SHA-256 when persistence or cross-process verification is needed.
 * In-memory only — add storage adapter when audit retention is required.
 */

export interface AuditEntry {
  /** Zero-based position in the chain. */
  index: number;

  /** ISO-8601 timestamp of when the event was recorded. */
  timestamp: string;

  /** What happened — free-form, caller decides granularity. */
  event: string;

  /** Who triggered it (peerId, 'system', etc.). */
  actor: string;

  /** Arbitrary structured detail the caller attaches. */
  detail?: unknown;

  /** Hash of the previous entry, or null for the genesis entry. */
  prevHash: string | null;

  /** Hash of this entry's content. */
  hash: string;
}

export interface AuditVerifyResult {
  valid: boolean;

  /** If invalid, the first index where the chain is broken. */
  breakIndex?: number;
}

/** djb2 — fast, deterministic, no crypto deps. */
function djb2(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function computeHash(entry: Omit<AuditEntry, 'hash'>): string {
  const payload = JSON.stringify([
    entry.index,
    entry.timestamp,
    entry.event,
    entry.actor,
    entry.detail,
    entry.prevHash,
  ]);
  return djb2(payload);
}

export class AuditLog {
  private chain: AuditEntry[] = [];

  /** Append a new event. Returns the entry. */
  public record(event: string, actor: string, detail?: unknown): AuditEntry {
    const prev = this.chain[this.chain.length - 1];
    const entry: AuditEntry = {
      index: this.chain.length,
      timestamp: new Date().toISOString(),
      event,
      actor,
      detail,
      prevHash: prev?.hash ?? null,
      hash: '',
    };
    entry.hash = computeHash(entry);
    this.chain.push(entry);
    return entry;
  }

  /** Verify the entire chain. O(n). */
  public verify(): AuditVerifyResult {
    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];
      if (!entry) continue;
      const expectedHash = computeHash(entry);

      if (entry.hash !== expectedHash) {
        return { valid: false, breakIndex: i };
      }

      if (i > 0) {
        const prev = this.chain[i - 1];
        if (!prev || entry.prevHash !== prev.hash) {
          return { valid: false, breakIndex: i };
        }
      }
    }
    return { valid: true };
  }

  public get length(): number {
    return this.chain.length;
  }

  public entries(): ReadonlyArray<AuditEntry> {
    return this.chain;
  }
}
