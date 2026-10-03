import emitted from '../../core/localization/audit-actions.json';
import { EMITTED_AUDIT_ACTIONS, auditActionLabel, curatedAuditActions } from './audit-labels';

// CF-100 AC1 (red-team B-100-1): every action the backend writes to the company audit log has a curated label. The committed list
// (core/localization/audit-actions.json) is the emitted set — the backend architecture test checks it against the code — and this spec
// checks it against the label catalogue.

describe('Audit action labels (CF-100)', () => {
  it('curates exactly the committed list of emitted actions', () => {
    expect(EMITTED_AUDIT_ACTIONS).toEqual(emitted);
    expect([...curatedAuditActions()].sort()).toEqual([...emitted].sort());
    expect(new Set(emitted).size).toBe(emitted.length);
  });

  it('gives every emitted action its own label, never the raw code', () => {
    for (const action of emitted) {
      const label = auditActionLabel(action);
      expect(label, action).not.toBe(action);
      expect(label, action).not.toMatch(/\b[a-z]+_[a-z_]+\b|\w\.\w/);
      expect(label, action).not.toMatch(/ event$|^Recorded event$/);
    }
    expect(auditActionLabel('tender.published')).toBe('Tender published');
    expect(auditActionLabel('session.revoked')).toBe('Signed out on all devices');
  });

  it('reads an uncurated action as its object plus "event", and an unknown one as a recorded event', () => {
    expect(auditActionLabel('tender.future_action')).toBe('Tender event');
    expect(auditActionLabel('retrospective.archived')).toBe('Past outcome event');
    expect(auditActionLabel('unknown_object.happened')).toBe('Recorded event');
  });
});
