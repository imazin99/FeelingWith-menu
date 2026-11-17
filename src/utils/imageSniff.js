// Magic-byte sniffing for uploaded images — architecture doc, section 5:
// "File content sniffed (magic-byte check), not just the extension/MIME
// header trusted." Deliberately dependency-free (brand spec: avoid
// unnecessary frameworks and dependencies).

const SIGNATURES = [
  { ext: '.jpg', mime: 'image/jpeg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: '.png',
    mime: 'image/png',
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: '.webp',
    mime: 'image/webp',
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

// Returns { ext, mime } for a recognized, allow-listed image, or null.
function sniffImage(buffer) {
  for (const sig of SIGNATURES) {
    if (sig.check(buffer)) return { ext: sig.ext, mime: sig.mime };
  }
  return null;
}

module.exports = { sniffImage };
