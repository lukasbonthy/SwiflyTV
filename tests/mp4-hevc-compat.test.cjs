'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { findHevcCompatibilityPatches, createBytePatchTransform } = require('../lib/mp4-hevc-compat');

function box(type, ...payloads) {
  const payload = Buffer.concat(payloads);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, payload]);
}
function config({ complete = false, types = [32, 33, 34, 39], badType = false } = {}) {
  const header = Buffer.alloc(23);
  header[0] = 1;
  header[21] = 3;
  header[22] = types.length;
  const arrays = types.map((type, i) => Buffer.from([
    (complete ? 128 : 0) | type, 0, 1, 0, 3,
    (badType && !i ? 31 : type) << 1, 1, 128
  ]));
  return box('hvcC', header, ...arrays);
}
function movie({ type = 'hev1', hvcc = config(), extra = Buffer.alloc(0), tail = Buffer.alloc(0) } = {}) {
  const entry = box(type, Buffer.alloc(78), hvcc, extra);
  const count = Buffer.alloc(8);
  count.writeUInt32BE(1, 4);
  return Buffer.concat([
    box('ftyp', Buffer.from('isom0000')),
    box('moov', box('trak', box('mdia', box('minf', box('stbl', box('stsd', count, entry), tail))))),
    box('mdat', Buffer.from('not a sample entry: hev1 and hvcC'))
  ]);
}
function patched(data, patches) {
  const output = Buffer.from(data);
  for (const patch of patches) {
    assert.equal(output[patch.offset], patch.before);
    output[patch.offset] = patch.after;
  }
  return output;
}
async function transform(chunks, patches, startOffset = 0) {
  const output = [];
  for await (const chunk of Readable.from(chunks).pipe(createBytePatchTransform(patches, startOffset))) output.push(chunk);
  return Buffer.concat(output);
}

test('patches only the sample entry and VPS/SPS/PPS flags, preserving SEI and all lengths', () => {
  const input = movie();
  const patches = findHevcCompatibilityPatches(input);
  assert.equal(patches.length, 5);
  assert.deepEqual(patches.map(p => [p.before, p.after]), [[101, 118], [118, 99], [32, 160], [33, 161], [34, 162]]);
  const output = patched(input, patches);
  assert.equal(output.length, input.length);
  assert.equal(output.subarray(patches[0].offset - 1, patches[0].offset + 3).toString(), 'hvc1');
  assert.deepEqual(findHevcCompatibilityPatches(output), []);
  assert.equal(output.subarray(-31).toString(), input.subarray(-31).toString());
});

test('complete arrays only need the hev1 sample entry patch', () => {
  assert.equal(findHevcCompatibilityPatches(movie({ hvcc: config({ complete: true }) })).length, 2);
});

test('ignores unsupported sample entries, encryption, and misleading strings in opaque payloads', () => {
  for (const type of ['hvc1', 'avc1', 'encv']) assert.deepEqual(findHevcCompatibilityPatches(movie({ type })), []);
  assert.deepEqual(findHevcCompatibilityPatches(movie({ extra: box('sinf', Buffer.alloc(0)) })), []);
  assert.deepEqual(findHevcCompatibilityPatches(box('mdat', movie())), []);
  assert.deepEqual(findHevcCompatibilityPatches(movie({ type: 'avc1', extra: box('free', movie()) })), []);
});

test('rejects missing, duplicate, incomplete, malformed or invalid hvcC records', () => {
  const inputs = [
    movie({ hvcc: Buffer.alloc(0) }),
    movie({ extra: config() }),
    movie({ hvcc: config({ types: [32, 33] }) }),
    movie({ hvcc: config({ types: [32, 33, 34, 34] }) }),
    movie({ hvcc: config({ badType: true }) })
  ];
  const malformedVersion = movie();
  malformedVersion[malformedVersion.indexOf('hvcC') + 4] = 2;
  inputs.push(malformedVersion);
  const malformedNal = movie();
  malformedNal[malformedNal.indexOf('hvcC') + 4 + 23 + 3] = 255;
  inputs.push(malformedNal);
  const truncated = movie();
  inputs.push(truncated.subarray(0, truncated.indexOf('hvcC') + 32));
  for (const input of inputs) assert.deepEqual(findHevcCompatibilityPatches(input, { fileSize: 100000 }), []);
});

test('rejects box overflows, unsafe extended sizes, entry counts and truncated required headers', () => {
  const input = movie();
  const oversized = Buffer.from(input);
  oversized.writeUInt32BE(0xffffffff, oversized.indexOf('hev1') - 4);
  assert.deepEqual(findHevcCompatibilityPatches(oversized), []);
  const impossibleCount = Buffer.from(input);
  impossibleCount.writeUInt32BE(1000, impossibleCount.indexOf('stsd') + 8);
  assert.deepEqual(findHevcCompatibilityPatches(impossibleCount), []);
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1);
  extended.write('moov', 4);
  extended.writeBigUInt64BE(2n ** 60n, 8);
  assert.deepEqual(findHevcCompatibilityPatches(extended, { fileSize: Number.MAX_SAFE_INTEGER }), []);
  for (let length = 0; length < input.indexOf('hvcC') + 8; length++) {
    assert.deepEqual(findHevcCompatibilityPatches(input.subarray(0, length), { fileSize: input.length }), []);
  }
});

test('matches exact four-character box types without discarding high bits', () => {
  const input = movie();
  input[input.indexOf('hev1')] |= 128;
  assert.deepEqual(findHevcCompatibilityPatches(input), []);
});

test('accepts safe extended-size containers and rejects every truncated sample entry', () => {
  const input = movie();
  const moovOffset = input.indexOf('moov') - 4;
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1);
  extended.write('moov', 4);
  extended.writeBigUInt64BE(BigInt(input.readUInt32BE(moovOffset) + 8), 8);
  const output = Buffer.concat([input.subarray(0, moovOffset), extended, input.subarray(moovOffset + 8)]);
  assert.equal(findHevcCompatibilityPatches(output).length, 5);
  const entryOffset = input.indexOf('hev1') - 4;
  const entryEnd = entryOffset + input.readUInt32BE(entryOffset);
  for (let length = entryOffset; length < entryEnd; length++) {
    assert.deepEqual(findHevcCompatibilityPatches(input.subarray(0, length), { fileSize: input.length }), []);
  }
});

test('accepts a large logical moov with complete entry before incomplete unrelated sample tables', () => {
  const input = movie({ tail: box('stsz', Buffer.alloc(200)) });
  const stszOffset = input.indexOf('stsz') - 4;
  const expansion = 6 * 1024 * 1024;
  for (const type of ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz']) {
    const offset = input.indexOf(type) - 4;
    input.writeUInt32BE(input.readUInt32BE(offset) + expansion, offset);
  }
  const prefix = input.subarray(0, stszOffset + 30);
  assert.equal(findHevcCompatibilityPatches(prefix, { fileSize: input.length + expansion }).length, 5);
  assert.deepEqual(findHevcCompatibilityPatches(prefix, { fileSize: input.length }), []);
});

test('byte transform handles single-byte chunks, partial ranges, and no-op patches', async () => {
  const input = movie();
  const patches = findHevcCompatibilityPatches(input);
  const expected = patched(input, patches);
  assert.deepEqual(await transform([...input].map(byte => Buffer.from([byte])), patches), expected);
  for (const patch of patches) {
    for (const start of [patch.offset, patch.offset + 1]) {
      assert.deepEqual(await transform([input.subarray(start, start + 3)], patches, start), expected.subarray(start, start + 3));
    }
  }
  assert.deepEqual(await transform([input], []), input);
  assert.deepEqual(await transform([input.subarray(0, 10)], patches), input.subarray(0, 10));
  assert.deepEqual(input, movie(), 'streaming must not mutate the input chunks');
});

test('byte transform fails closed when a patch does not match the response byte', async () => {
  await assert.rejects(transform([Buffer.from('abc')], [{ offset: 1, before: 120, after: 121 }]), /Media compatibility patch mismatch/);
});
