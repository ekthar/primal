import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../src/notifications.js';

describe('Wave 3 · notification templates are resend-ready', () => {
  const statuses = ['application.approved', 'application.rejected', 'application.needs_correction'];

  for (const key of statuses) {
    it(`${key} exposes subject + text + html`, () => {
      const t = TEMPLATES[key];
      expect(t).toBeTruthy();
      expect(typeof t.subject).toBe('function');
      expect(typeof t.text).toBe('function');
      expect(typeof t.html).toBe('function');
    });

    it(`${key} renders with minimal payload`, () => {
      const payload = {
        applicantName: 'Test Fighter',
        applicationDisplayId: 'PR-123',
        tournamentName: 'Primal Cup',
        reason: 'Profile photo missing',
        dueAt: '2026-05-01',
        appealWindowDays: 7,
      };
      const t = TEMPLATES[key];
      const text = t.text(payload);
      const html = t.html(payload);
      expect(text).toContain('Primal');
      expect(html).toContain('Primal');
    });

    it(`${key} SMS body stays within Twilio body limit`, () => {
      const payload = {
        applicantName: 'A'.repeat(40),
        applicationDisplayId: 'PR-123',
        tournamentName: 'B'.repeat(60),
        reason: 'C'.repeat(80),
        dueAt: '2026-05-01',
        appealWindowDays: 7,
      };
      const body = TEMPLATES[key].text(payload);
      // We truncate at 640 chars in the dispatcher; keep templates well under that so
      // we never rely on truncation for typical payloads.
      expect(body.length).toBeLessThan(500);
    });
  }
});
