'use strict';
const { Transform } = require('node:stream');

const MAX_PREFIX = 64 * 1024;
const MAX_BOXES = 4096;
const MAX_ENTRIES = 128;
const CONTAINER_PATH = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'];

// Only inspect structural boxes. Opaque media/sample-table payloads are never
// searched, and all returned offsets refer to the original, unchanged file.
function findHevcCompatibilityPatches(prefix, { fileSize = prefix?.length } = {}) {
  if (!Buffer.isBuffer(prefix) || prefix.length > MAX_PREFIX ||
      !Number.isSafeInteger(fileSize) || fileSize < prefix.length) return [];
  let boxCount = 0;
  const patches = [];
  const invalid = () => { throw new Error('Invalid MP4 header'); };
  const available = (offset, length) => {
    if (offset < 0 || length < 0 || offset + length > prefix.length) invalid();
  };
  function readBox(offset, parentEnd) {
    if (++boxCount > MAX_BOXES) invalid();
    available(offset, 8);
    const type = prefix.toString('latin1', offset + 4, offset + 8);
    let size = prefix.readUInt32BE(offset);
    let headerSize = 8;
    if (size === 1) {
      available(offset, 16);
      const extended = prefix.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
      size = Number(extended);
      headerSize = 16;
    } else if (size === 0) {
      size = parentEnd - offset;
    }
    const end = offset + size;
    if (size < headerSize || !Number.isSafeInteger(end) || end > parentEnd || end > fileSize) invalid();
    return { offset, type, payload: offset + headerSize, end };
  }
  function configPatches(box) {
    available(box.payload, box.end - box.payload);
    if (box.end - box.payload < 23 || prefix[box.payload] !== 1) invalid();
    const arrayCount = prefix[box.payload + 22];
    if (arrayCount > 64) invalid();
    let cursor = box.payload + 23;
    const seen = new Set();
    const changes = [];
    let nalCount = 0;
    for (let i = 0; i < arrayCount; i++) {
      if (cursor + 3 > box.end) invalid();
      const flagOffset = cursor;
      const flags = prefix[cursor];
      const type = flags & 63;
      const count = prefix.readUInt16BE(cursor + 1);
      if ((flags & 64) || seen.has(type) || count === 0 || (nalCount += count) > 1024) invalid();
      seen.add(type);
      cursor += 3;
      for (let j = 0; j < count; j++) {
        if (cursor + 2 > box.end) invalid();
        const length = prefix.readUInt16BE(cursor);
        cursor += 2;
        if (length < 2 || cursor + length > box.end) invalid();
        // forbidden_zero_bit and temporal_id_plus1 must also be valid.
        if ((prefix[cursor] & 128) || ((prefix[cursor] >> 1) & 63) !== type ||
            (prefix[cursor + 1] & 7) === 0) invalid();
        cursor += length;
      }
      if (type >= 32 && type <= 34 && !(flags & 128)) {
        changes.push({ offset: flagOffset, before: flags, after: flags | 128 });
      }
    }
    if (cursor !== box.end || ![32, 33, 34].every(type => seen.has(type))) invalid();
    return changes;
  }
  function sampleDescription(box) {
    available(box.payload, box.end - box.payload);
    if (box.payload + 8 > box.end || prefix.readUInt32BE(box.payload) !== 0) invalid();
    const count = prefix.readUInt32BE(box.payload + 4);
    if (count > MAX_ENTRIES) invalid();
    let cursor = box.payload + 8;
    for (let i = 0; i < count; i++) {
      const entry = readBox(cursor, box.end);
      cursor = entry.end;
      if (entry.type !== 'hev1') continue;
      if (entry.payload + 78 > entry.end) invalid();
      let childOffset = entry.payload + 78;
      let configuration;
      let encrypted = false;
      while (childOffset < entry.end) {
        const child = readBox(childOffset, entry.end);
        childOffset = child.end;
        if (child.type === 'sinf') encrypted = true;
        if (child.type === 'hvcC') {
          if (configuration) invalid();
          configuration = configPatches(child);
        }
      }
      if (encrypted) continue;
      if (!configuration) invalid();
      patches.push(
        { offset: entry.offset + 5, before: 101, after: 118 },
        { offset: entry.offset + 6, before: 118, after: 99 },
        ...configuration
      );
    }
    if (cursor !== box.end) invalid();
  }
  function walk(start, end, depth) {
    let cursor = start;
    let foundDescription = false;
    while (cursor < end) {
      // Sample tables can run for megabytes after a fully available stsd.
      // Once beyond the bounded prefix, unrelated siblings need no payload.
      if (cursor + 8 > prefix.length && patches.length) return;
      const box = readBox(cursor, end);
      if (box.type === CONTAINER_PATH[depth]) {
        if (depth === CONTAINER_PATH.length - 1) {
          if (foundDescription) invalid();
          sampleDescription(box);
          foundDescription = true;
        } else {
          walk(box.payload, box.end, depth + 1);
        }
      }
      cursor = box.end;
    }
  }
  try {
    walk(0, fileSize, 0);
    return patches.sort((a, b) => a.offset - b.offset);
  } catch {
    return [];
  }
}

function createBytePatchTransform(patches, startOffset = 0) {
  if (!Array.isArray(patches) || !Number.isSafeInteger(startOffset) || startOffset < 0) {
    throw new TypeError('Invalid media compatibility patches');
  }
  const ordered = patches.map(patch => ({ ...patch })).sort((a, b) => a.offset - b.offset);
  for (let i = 0; i < ordered.length; i++) {
    const { offset, before, after } = ordered[i];
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(before) || before < 0 || before > 255 ||
        !Number.isInteger(after) || after < 0 || after > 255 || (i && ordered[i - 1].offset === offset)) {
      throw new TypeError('Invalid media compatibility patches');
    }
  }
  let position = startOffset;
  let next = 0;
  while (next < ordered.length && ordered[next].offset < startOffset) next++;
  return new Transform({
    transform(chunk, encoding, callback) {
      const end = position + chunk.length;
      if (!Number.isSafeInteger(end)) return callback(new Error('Invalid media response range'));
      let output = chunk;
      while (next < ordered.length && ordered[next].offset < end) {
        const patch = ordered[next++];
        const index = patch.offset - position;
        if (chunk[index] !== patch.before) return callback(new Error('Media compatibility patch mismatch'));
        if (output === chunk) output = Buffer.from(chunk);
        output[index] = patch.after;
      }
      position = end;
      callback(null, output);
    }
  });
}

module.exports = { findHevcCompatibilityPatches, createBytePatchTransform };
