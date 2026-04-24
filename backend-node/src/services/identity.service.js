const { createHash } = require('crypto');

function formatPersonName(firstName, lastName) {
  return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ').trim();
}

function splitPersonName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function buildDisplayCode(prefix, value) {
  const digest = createHash('sha256').update(String(value || '')).digest('base64url');
  const normalized = digest.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return `${prefix}-${normalized.slice(0, 5).padEnd(5, 'X')}`;
}

function applicationDisplayId(value) {
  return buildDisplayCode('APP', value);
}

function reviewerDisplayId(value) {
  return buildDisplayCode('REV', value);
}

module.exports = {
  formatPersonName,
  splitPersonName,
  applicationDisplayId,
  reviewerDisplayId,
};
