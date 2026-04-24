import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Static read of the service source guards the XLSX schema — the weigh-in
// roster downstream pipeline relies on these two new columns being present.
describe('participants XLSX schema', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/services/export.service.js'),
    'utf-8',
  );

  it('exposes a Weight (kg) column', () => {
    expect(source).toContain("header: 'Weight (kg)'");
    expect(source).toContain("key: 'weightKg'");
  });

  it('exposes a Weight category column', () => {
    expect(source).toContain("header: 'Weight category'");
    expect(source).toContain("key: 'weightClass'");
  });
});
