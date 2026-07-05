import { describe, expect, it } from 'vitest';

import type { AuditEntry } from './audit-log';
import { AuditLog } from './audit-log';

describe('AuditLog', () => {
  it('records entries with incrementing indices', () => {
    const log = new AuditLog();
    log.record('room.created', 'peer-a');
    log.record('lock.acquired', 'peer-b', { key: 'doc-1' });
    expect(log.length).toBe(2);
    const entries = log.entries();
    expect(entries[0].index).toBe(0);
    expect(entries[1].index).toBe(1);
  });

  it('chains hashes — prevHash links to previous entry hash', () => {
    const log = new AuditLog();
    const e0 = log.record('init', 'system');
    const e1 = log.record('join', 'peer-a');
    expect(e0.prevHash).toBeNull();
    expect(e1.prevHash).toBe(e0.hash);
  });

  it('verify returns valid for an untampered chain', () => {
    const log = new AuditLog();
    log.record('a', '1');
    log.record('b', '2');
    log.record('c', '3');
    expect(log.verify()).toEqual({ valid: true });
  });

  it('verify detects a tampered hash', () => {
    const log = new AuditLog();
    log.record('a', '1');
    log.record('b', '2');
    (log.entries() as AuditEntry[])[0].event = 'tampered';
    const result = log.verify();
    expect(result.valid).toBe(false);
    expect(result.breakIndex).toBe(0);
  });

  it('verify detects a broken prevHash link', () => {
    const log = new AuditLog();
    log.record('a', '1');
    log.record('b', '2');
    (log.entries() as AuditEntry[])[1].prevHash = 'deadbeef';
    const result = log.verify();
    expect(result.valid).toBe(false);
    expect(result.breakIndex).toBe(1);
  });

  it('empty log is valid', () => {
    expect(new AuditLog().verify()).toEqual({ valid: true });
  });
});
