// ═══════════════════════════════════════════════════════════════
//  homography.js — normalized DLT homography solver.
//  JS replacement for cv2.findHomography() / cv2.perspectiveTransform()
//  used in the Python port's hand_tracking.py.
// ═══════════════════════════════════════════════════════════════

// ---- tiny 3x3 helpers -------------------------------------------------
function matMul3(A, B) {
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) R[i][j] += A[i][k] * B[k][j];
  return R;
}

function matInv3(A) {
  const [a, b, c] = A[0], [d, e, f] = A[1], [g, h, i] = A[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

// ---- Jacobi eigenvalue algorithm for symmetric NxN matrices -----------
// Returns { values: [...], vectors: [[...], ...] } (vectors as columns,
// i.e. vectors[k] is the eigenvector for values[k]).
function jacobiEigen(matrixIn, n, maxSweeps = 100) {
  const A = matrixIn.map(row => row.slice());
  let V = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-20) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        const App = A[p][p], Aqq = A[q][q], Apq = A[p][q];
        A[p][p] = App - t * Apq;
        A[q][q] = Aqq + t * Apq;
        A[p][q] = 0;
        A[q][p] = 0;

        for (let k = 0; k < n; k++) {
          if (k !== p && k !== q) {
            const Akp = A[k][p], Akq = A[k][q];
            A[k][p] = c * Akp - s * Akq;
            A[p][k] = A[k][p];
            A[k][q] = s * Akp + c * Akq;
            A[q][k] = A[k][q];
          }
        }
        for (let k = 0; k < n; k++) {
          const Vkp = V[k][p], Vkq = V[k][q];
          V[k][p] = c * Vkp - s * Vkq;
          V[k][q] = s * Vkp + c * Vkq;
        }
      }
    }
  }

  const values = Array.from({ length: n }, (_, i) => A[i][i]);
  const vectors = Array.from({ length: n }, (_, k) => V.map(row => row[k]));
  return { values, vectors };
}

function normalizePoints(pts) {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= n; cy /= n;

  let meanDist = 0;
  for (const [x, y] of pts) meanDist += Math.hypot(x - cx, y - cy);
  meanDist /= n;
  const scale = meanDist > 1e-8 ? Math.sqrt(2) / meanDist : 1;

  const T = [
    [scale, 0, -scale * cx],
    [0, scale, -scale * cy],
    [0, 0, 1],
  ];
  const normPts = pts.map(([x, y]) => [scale * (x - cx), scale * (y - cy)]);
  return { T, normPts };
}

/**
 * Computes a 3x3 homography mapping `pairs[i].cam` -> `pairs[i].proj`.
 * pairs: [{ cam: [x, y], proj: [x, y] }, ...], needs >= 4 points.
 * Returns a 3x3 array (row-major) or null.
 */
export function computeHomography(pairs) {
  if (!pairs || pairs.length < 4) return null;

  const srcPts = pairs.map(p => p.cam);
  const dstPts = pairs.map(p => p.proj);
  const { T: Tsrc, normPts: nSrc } = normalizePoints(srcPts);
  const { T: Tdst, normPts: nDst } = normalizePoints(dstPts);

  const n = pairs.length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = nSrc[i];
    const [u, v] = nDst[i];
    rows.push([-x, -y, -1, 0, 0, 0, u * x, u * y, u]);
    rows.push([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
  }

  // Build 9x9 A^T A
  const AtA = Array.from({ length: 9 }, () => new Array(9).fill(0));
  for (const row of rows) {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) AtA[i][j] += row[i] * row[j];
    }
  }

  const { values, vectors } = jacobiEigen(AtA, 9);
  let minIdx = 0;
  for (let i = 1; i < 9; i++) if (values[i] < values[minIdx]) minIdx = i;
  const h = vectors[minIdx];

  const Hn = [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], h[8]],
  ];

  const TdstInv = matInv3(Tdst);
  if (!TdstInv) return null;
  let H = matMul3(matMul3(TdstInv, Hn), Tsrc);

  const s = H[2][2];
  if (Math.abs(s) > 1e-12) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[i][j] /= s;
  }
  return H;
}

/** Applies a homography to a single point. Returns [x, y] or null. */
export function applyHomography(H, pt) {
  if (!H) return null;
  const [x, y] = pt;
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  if (Math.abs(w) < 1e-12) return null;
  const nx = (H[0][0] * x + H[0][1] * y + H[0][2]) / w;
  const ny = (H[1][0] * x + H[1][1] * y + H[1][2]) / w;
  return [nx, ny];
}
