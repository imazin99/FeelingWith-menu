const { sniffImage } = require('../../src/utils/imageSniff');

describe('sniffImage', () => {
  test('recognizes a JPEG magic byte sequence', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffImage(buf)).toEqual({ ext: '.jpg', mime: 'image/jpeg' });
  });

  test('recognizes a PNG magic byte sequence', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffImage(buf)).toEqual({ ext: '.png', mime: 'image/png' });
  });

  test('recognizes a WebP (RIFF....WEBP) magic byte sequence', () => {
    const buf = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary');
    expect(sniffImage(buf)).toEqual({ ext: '.webp', mime: 'image/webp' });
  });

  test('rejects a file with a .jpg-ish name but non-image bytes (disguised upload)', () => {
    const buf = Buffer.from('#!/bin/sh\necho not-an-image\n');
    expect(sniffImage(buf)).toBeNull();
  });

  test('rejects an empty buffer', () => {
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  test('rejects a GIF (not on the allow-list)', () => {
    const buf = Buffer.from('GIF89a', 'binary');
    expect(sniffImage(buf)).toBeNull();
  });
});
