const { createHash } = require('crypto');

const INTERNAL_PALETTES = [
  { background: '#8c6a43', foreground: '#f8f5ef' },
  { background: '#2f3742', foreground: '#f8f5ef' },
  { background: '#5f6773', foreground: '#f8f5ef' },
  { background: '#6d4c41', foreground: '#f8f5ef' },
  { background: '#4f5d75', foreground: '#f8f5ef' },
];

function avatarSeed(value) {
  return createHash('sha256').update(String(value || 'primal-avatar')).digest('hex');
}

function initialsFromName(name) {
  const parts = String(name || 'P')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildInitialsAvatarSvg(name, seed) {
  const paletteIndex = parseInt(seed.slice(0, 2), 16) % INTERNAL_PALETTES.length;
  const palette = INTERNAL_PALETTES[paletteIndex];
  const initials = initialsFromName(name);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Avatar">',
    `<rect width="96" height="96" rx="24" fill="${palette.background}"/>`,
    '<circle cx="74" cy="22" r="10" fill="rgba(255,255,255,0.12)"/>',
    `<text x="48" y="56" text-anchor="middle" font-family="Inter Tight, Manrope, sans-serif" font-size="30" font-weight="700" fill="${palette.foreground}">${initials}</text>`,
    '</svg>',
  ].join('');
}

function buildSilhouetteAvatarSvg(seed) {
  const hue = parseInt(seed.slice(2, 4), 16) % 24;
  const background = `hsl(${205 + hue} 18% 92%)`;
  const accent = `hsl(${210 + hue} 18% 72%)`;
  const foreground = `hsl(${210 + hue} 18% 38%)`;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Avatar">',
    `<rect width="96" height="96" rx="24" fill="${background}"/>`,
    `<circle cx="48" cy="34" r="18" fill="${accent}"/>`,
    `<path d="M20 84c2-16 13-24 28-24s26 8 28 24" fill="${foreground}" opacity="0.95"/>`,
    '</svg>',
  ].join('');
}

function createInitialsAvatarDataUrl(name, key) {
  const seed = avatarSeed(key || name);
  return svgToDataUrl(buildInitialsAvatarSvg(name, seed));
}

function createSilhouetteAvatarDataUrl(name, key) {
  const seed = avatarSeed(key || name);
  return svgToDataUrl(buildSilhouetteAvatarSvg(seed));
}

function resolveAvatarUrl({ explicitAvatarUrl, photoAvatarUrl, name, key, audience }) {
  if (explicitAvatarUrl) return explicitAvatarUrl;
  if (photoAvatarUrl) return photoAvatarUrl;
  if (audience === 'internal') return createInitialsAvatarDataUrl(name, key);
  return createSilhouetteAvatarDataUrl(name, key);
}

module.exports = {
  createInitialsAvatarDataUrl,
  createSilhouetteAvatarDataUrl,
  resolveAvatarUrl,
};
