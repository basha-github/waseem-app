// gifDecoder.js — minimal, dependency-free GIF89a decoder.
//
// Parses the global/local color tables and graphic control extensions,
// LZW-decodes each frame's pixel indices, and composites frames into
// full-canvas-size RGBA buffers honoring each frame's disposal method.
//
// Exposes: parseGIF(arrayBuffer) -> { width, height, frames: [{ rgba: Uint8ClampedArray, delay: ms }] }

function parseGIF(buf) {
  const bytes = new Uint8Array(buf);
  let pos = 0;

  function readByte() { return bytes[pos++]; }
  function readUint16() { const v = bytes[pos] | (bytes[pos + 1] << 8); pos += 2; return v; }
  function readBytes(n) { const b = bytes.subarray(pos, pos + n); pos += n; return b; }

  // --- Header ---
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (sig !== "GIF87a" && sig !== "GIF89a") {
    throw new Error("Not a GIF file");
  }
  pos = 6;

  const width = readUint16();
  const height = readUint16();
  const packed = readByte();
  const globalColorTableFlag = (packed & 0x80) !== 0;
  const globalColorTableSize = 2 << (packed & 0x07);
  readByte(); // background color index
  readByte(); // pixel aspect ratio

  let globalColorTable = null;
  if (globalColorTableFlag) {
    globalColorTable = readBytes(globalColorTableSize * 3);
  }

  const rawFrames = [];
  let gceDelay = 10; // in 1/100s, default
  let gceTransparentIndex = -1;
  let gceDisposal = 0;

  function readSubBlocks() {
    const chunks = [];
    let total = 0;
    let size;
    while ((size = readByte()) !== 0) {
      const chunk = readBytes(size);
      chunks.push(chunk);
      total += size;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    return out;
  }

  while (pos < bytes.length) {
    const blockType = readByte();

    if (blockType === 0x3b) {
      // Trailer
      break;
    } else if (blockType === 0x21) {
      // Extension
      const label = readByte();
      if (label === 0xf9) {
        // Graphic Control Extension
        const blockSize = readByte(); // always 4
        const flags = readByte();
        gceDisposal = (flags >> 2) & 0x07;
        gceTransparentIndex = (flags & 0x01) ? -2 : -1; // placeholder, real index read below
        gceDelay = readUint16();
        const transparentColorIndex = readByte();
        gceTransparentIndex = (flags & 0x01) ? transparentColorIndex : -1;
        readByte(); // block terminator (0)
      } else {
        // Comment / Application / Plain Text extension — skip sub-blocks
        readSubBlocks();
      }
    } else if (blockType === 0x2c) {
      // Image Descriptor
      const left = readUint16();
      const top = readUint16();
      const w = readUint16();
      const h = readUint16();
      const imgPacked = readByte();
      const localColorTableFlag = (imgPacked & 0x80) !== 0;
      const interlaced = (imgPacked & 0x40) !== 0;
      const localColorTableSize = 2 << (imgPacked & 0x07);

      let colorTable = globalColorTable;
      if (localColorTableFlag) {
        colorTable = readBytes(localColorTableSize * 3);
      }

      const minCodeSize = readByte();
      const lzwData = readSubBlocks();
      const indices = lzwDecode(minCodeSize, lzwData, w * h);

      const finalIndices = interlaced ? deinterlace(indices, w, h) : indices;

      rawFrames.push({
        left, top, width: w, height: h,
        colorTable,
        indices: finalIndices,
        delay: gceDelay * 10, // convert to ms
        disposal: gceDisposal,
        transparentIndex: gceTransparentIndex,
      });

      // Reset GCE defaults for next frame (spec: applies to the single next frame)
      gceDelay = 10;
      gceTransparentIndex = -1;
      gceDisposal = 0;
    } else {
      // Unknown block type — bail out to avoid infinite loop on malformed data
      break;
    }
  }

  const frames = compositeFrames(rawFrames, width, height);
  return { width, height, frames };
}

function deinterlace(indices, w, h) {
  const out = new Uint8Array(indices.length);
  const passes = [
    { start: 0, step: 8 },
    { start: 4, step: 8 },
    { start: 2, step: 4 },
    { start: 1, step: 2 },
  ];
  let srcRow = 0;
  for (const p of passes) {
    for (let row = p.start; row < h; row += p.step) {
      out.set(indices.subarray(srcRow * w, srcRow * w + w), row * w);
      srcRow++;
    }
  }
  return out;
}

function lzwDecode(minCodeSize, data, pixelCount) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const DICT_MAX = 4096;

  let codeSize, nextCode;
  const prefix = new Int32Array(DICT_MAX);
  const suffix = new Uint8Array(DICT_MAX);
  const output = new Uint8Array(pixelCount);
  let outputPos = 0;

  let bitBuf = 0, bitCount = 0, dataPos = 0;
  function readCode() {
    while (bitCount < codeSize) {
      if (dataPos >= data.length) { bitBuf |= 0 << bitCount; bitCount += 8; dataPos++; continue; }
      bitBuf |= data[dataPos++] << bitCount;
      bitCount += 8;
    }
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>>= codeSize;
    bitCount -= codeSize;
    return code;
  }

  function resetDict() {
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
    for (let i = 0; i < clearCode; i++) { prefix[i] = -1; suffix[i] = i; }
  }

  function firstChar(code) {
    while (code >= clearCode && prefix[code] !== -1) code = prefix[code];
    return suffix[code];
  }

  resetDict();
  const stack = new Uint8Array(DICT_MAX + 1);
  let prevCode = -1;

  while (outputPos < pixelCount) {
    const code = readCode();

    if (code === clearCode) { resetDict(); prevCode = -1; continue; }
    if (code === eoiCode) break;

    let stackPos = 0;
    let inCode = code;

    if (code >= nextCode) {
      // KwKwK special case
      stack[stackPos++] = firstChar(prevCode);
      inCode = prevCode;
    }

    while (inCode >= clearCode) {
      stack[stackPos++] = suffix[inCode];
      inCode = prefix[inCode];
    }
    stack[stackPos++] = suffix[inCode];
    // suffix[inCode] here is the first character of the string just decoded
    // for `code` (whether it came from the normal path or the KwKwK case) —
    // this is what a new dictionary entry must append, NOT firstChar(prevCode).
    const decodedFirstChar = suffix[inCode];

    while (stackPos > 0 && outputPos < pixelCount) {
      output[outputPos++] = stack[--stackPos];
    }

    if (prevCode !== -1 && nextCode < DICT_MAX) {
      prefix[nextCode] = prevCode;
      suffix[nextCode] = decodedFirstChar;
      nextCode++;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prevCode = code;
  }

  return output;
}

function compositeFrames(rawFrames, canvasW, canvasH) {
  const frames = [];
  // Full-canvas RGBA buffer we keep mutating across frames
  let canvas = new Uint8ClampedArray(canvasW * canvasH * 4);
  let prevCanvasForRestore = null;
  let prevDisposal = 0;
  let prevRect = null;

  for (const f of rawFrames) {
    // Apply disposal of the PREVIOUS frame before drawing this one
    if (prevDisposal === 2 && prevRect) {
      // Restore to background (transparent/clear) over previous frame's rect
      clearRect(canvas, canvasW, prevRect);
    } else if (prevDisposal === 3 && prevCanvasForRestore) {
      canvas.set(prevCanvasForRestore);
    }
    // disposal 0 or 1: leave canvas as-is (do not dispose)

    if (f.disposal === 3) {
      // Save canvas state BEFORE drawing this frame, to restore after it
      prevCanvasForRestore = canvas.slice();
    } else {
      prevCanvasForRestore = null;
    }

    drawIndexedFrame(canvas, canvasW, f);

    frames.push({ rgba: canvas.slice(), delay: f.delay > 0 ? f.delay : 100 });

    prevDisposal = f.disposal;
    prevRect = { left: f.left, top: f.top, width: f.width, height: f.height };
  }

  return frames;
}

function clearRect(canvas, canvasW, rect) {
  for (let y = 0; y < rect.height; y++) {
    const row = rect.top + y;
    let idx = (row * canvasW + rect.left) * 4;
    for (let x = 0; x < rect.width; x++) {
      canvas[idx] = 0; canvas[idx + 1] = 0; canvas[idx + 2] = 0; canvas[idx + 3] = 0;
      idx += 4;
    }
  }
}

function drawIndexedFrame(canvas, canvasW, f) {
  const { left, top, width, height, colorTable, indices, transparentIndex } = f;
  for (let y = 0; y < height; y++) {
    const row = top + y;
    let srcIdx = y * width;
    let dstIdx = (row * canvasW + left) * 4;
    for (let x = 0; x < width; x++) {
      const colorIndex = indices[srcIdx++];
      if (colorIndex !== transparentIndex) {
        const ci = colorIndex * 3;
        canvas[dstIdx] = colorTable[ci];
        canvas[dstIdx + 1] = colorTable[ci + 1];
        canvas[dstIdx + 2] = colorTable[ci + 2];
        canvas[dstIdx + 3] = 255;
      }
      dstIdx += 4;
    }
  }
}

export { parseGIF };
