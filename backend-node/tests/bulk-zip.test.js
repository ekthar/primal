import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import archiver from 'archiver';
import { PassThrough } from 'stream';

describe('bulk participants ZIP', () => {
  it('endpoint is protected and returns 401 without auth', async () => {
    const res = await request(app).get('/api/reports/participants.zip');
    expect(res.status).toBe(401);
  });

  it('archiver assembles a valid ZIP from in-memory PDF-like buffers', async () => {
    const archive = archiver('zip', { zlib: { level: 5 } });
    const pass = new PassThrough();
    const chunks = [];
    pass.on('data', (c) => chunks.push(c));
    const finished = new Promise((resolve, reject) => {
      pass.on('end', resolve);
      pass.on('error', reject);
    });
    archive.pipe(pass);

    // Fake PDF payloads — the ZIP layer is independent of the PDF generator.
    archive.append(Buffer.from('%PDF-1.7 fake A\n'), { name: 'primal_a.pdf' });
    archive.append(Buffer.from('%PDF-1.7 fake B\n'), { name: 'primal_b.pdf' });
    archive.append('manifest text\n', { name: 'manifest.txt' });
    await archive.finalize();
    await finished;

    const zipBuf = Buffer.concat(chunks);
    // ZIP local-file-header signature 'PK\x03\x04'
    expect(zipBuf[0]).toBe(0x50);
    expect(zipBuf[1]).toBe(0x4b);
    expect(zipBuf[2]).toBe(0x03);
    expect(zipBuf[3]).toBe(0x04);
    // Central directory end-of-archive signature 'PK\x05\x06' must be present
    const zipStr = zipBuf.toString('latin1');
    expect(zipStr.includes('primal_a.pdf')).toBe(true);
    expect(zipStr.includes('primal_b.pdf')).toBe(true);
    expect(zipStr.includes('manifest.txt')).toBe(true);
  });
});
