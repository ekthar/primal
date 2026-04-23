const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');
const { config } = require('../config');
const { logger } = require('../logger');

const BLOB_RETRY_ATTEMPTS = 3;
const BLOB_RETRY_DELAY_MS = 500;

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function sanitizeFilename(originalFilename) {
  const safeName = String(originalFilename || 'file').replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!safeName) {
    throw new Error('Unable to derive a safe filename');
  }
  return safeName;
}

function ensureLocalDirectory(applicationId) {
  const directoryPath = path.resolve(config.uploadDir, 'applications', applicationId);
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

function buildLocalStorageKey(applicationId, originalFilename) {
  const safeFilename = sanitizeFilename(originalFilename);
  return path.join('applications', applicationId, `${Date.now()}-${safeFilename}`).replace(/\\/g, '/');
}

function buildBlobPathname(applicationId, originalFilename) {
  const safeFilename = sanitizeFilename(originalFilename);
  return `applications/${applicationId}/${Date.now()}-${safeFilename}`;
}

function getBlobToken() {
  const token = config.blob.readWriteToken;
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required when UPLOAD_STORAGE_PROVIDER=vercel-blob');
  }
  return token;
}

function getPublicDocumentUrl(storageKey) {
  if (isAbsoluteHttpUrl(storageKey)) {
    return storageKey;
  }
  const baseUrl = String(config.appBaseUrl || '').replace(/\/+$/, '');
  return `${baseUrl}/uploads/${String(storageKey || '').replace(/^\/+/, '')}`;
}

async function wait(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withBlobRetries(operationName, details, operation) {
  let lastError = null;
  for (let attempt = 1; attempt <= BLOB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < BLOB_RETRY_ATTEMPTS) {
        logger.warn({ operationName, attempt, details, err: error }, 'Blob operation failed, retrying');
        await wait(BLOB_RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  throw new Error(`${operationName} failed after ${BLOB_RETRY_ATTEMPTS} attempts: ${lastError ? lastError.message : 'unknown error'}`);
}

async function storeLocally(applicationId, file) {
  const storageKey = buildLocalStorageKey(applicationId, file.originalname);
  const absolutePath = path.resolve(config.uploadDir, storageKey);
  ensureLocalDirectory(applicationId);
  await fs.promises.writeFile(absolutePath, file.buffer);
  return {
    storageKey,
    url: getPublicDocumentUrl(storageKey),
  };
}

async function storeInBlob(applicationId, file) {
  const pathname = buildBlobPathname(applicationId, file.originalname);
  const blob = await withBlobRetries(
    'vercel_blob_put',
    {
      applicationId,
      pathname,
      contentType: file.mimetype,
      sizeBytes: file.size,
    },
    () => put(pathname, file.buffer, {
      access: config.blob.access,
      addRandomSuffix: true,
      contentType: file.mimetype,
      multipart: file.size >= 5 * 1024 * 1024,
      token: getBlobToken(),
    }),
  );

  return {
    storageKey: blob.url,
    url: blob.url,
  };
}

async function storeDocument(applicationId, file) {
  if (config.uploadStorageProvider === 'vercel-blob') {
    return storeInBlob(applicationId, file);
  }
  return storeLocally(applicationId, file);
}

async function readDocumentBuffer(documentRow) {
  if (isAbsoluteHttpUrl(documentRow.storage_key)) {
    const response = await withBlobRetries(
      'document_fetch',
      {
        storageKey: documentRow.storage_key,
        documentId: documentRow.id,
      },
      () => fetch(documentRow.storage_key),
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch remote document: status=${response.status} storageKey=${documentRow.storage_key}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  const absolutePath = path.resolve(config.uploadDir, documentRow.storage_key);
  return fs.promises.readFile(absolutePath);
}

module.exports = {
  getPublicDocumentUrl,
  readDocumentBuffer,
  storeDocument,
};
