/// <reference lib="webworker" />

export interface DiffCharSegment {
  text: string;
  highlight: boolean;
}

export interface UnifiedDiffLine {
  type: 'equal' | 'add' | 'remove';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
  segments?: DiffCharSegment[];
}

export interface SplitDiffRow {
  leftLineNumber: number | null;
  leftContent: string;
  leftType: 'equal' | 'remove' | 'empty';
  leftSegments?: DiffCharSegment[];
  rightLineNumber: number | null;
  rightContent: string;
  rightType: 'equal' | 'add' | 'empty';
  rightSegments?: DiffCharSegment[];
}

export interface DiffWorkerRequest {
  original: string;
  modified: string;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
}

export interface DiffWorkerResult {
  unified: UnifiedDiffLine[];
  split: SplitDiffRow[];
  added: number;
  removed: number;
  unchanged: number;
  identical: boolean;
}

function normalizeLine(line: string, ignoreWhitespace: boolean, ignoreCase: boolean): string {
  let out = line;
  if (ignoreWhitespace) {
    out = out.replace(/\s+/g, ' ').trim();
  }
  if (ignoreCase) {
    out = out.toLowerCase();
  }
  return out;
}

function computeIntraLineSegments(
  oldStr: string,
  newStr: string
): { oldSegments: DiffCharSegment[]; newSegments: DiffCharSegment[] } {
  // Fast prefix/suffix + middle character-level diff
  let prefixLen = 0;
  const minLen = Math.min(oldStr.length, newStr.length);
  while (prefixLen < minLen && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++;
  }

  let oldSuffixIdx = oldStr.length;
  let newSuffixIdx = newStr.length;
  while (
    oldSuffixIdx > prefixLen &&
    newSuffixIdx > prefixLen &&
    oldStr[oldSuffixIdx - 1] === newStr[newSuffixIdx - 1]
  ) {
    oldSuffixIdx--;
    newSuffixIdx--;
  }

  const oldSegments: DiffCharSegment[] = [];
  const newSegments: DiffCharSegment[] = [];

  if (prefixLen > 0) {
    const prefix = oldStr.slice(0, prefixLen);
    oldSegments.push({ text: prefix, highlight: false });
    newSegments.push({ text: prefix, highlight: false });
  }

  if (oldSuffixIdx > prefixLen) {
    oldSegments.push({ text: oldStr.slice(prefixLen, oldSuffixIdx), highlight: true });
  }
  if (newSuffixIdx > prefixLen) {
    newSegments.push({ text: newStr.slice(prefixLen, newSuffixIdx), highlight: true });
  }

  if (oldSuffixIdx < oldStr.length) {
    const suffix = oldStr.slice(oldSuffixIdx);
    oldSegments.push({ text: suffix, highlight: false });
    newSegments.push({ text: suffix, highlight: false });
  }

  return { oldSegments, newSegments };
}

self.onmessage = (event: MessageEvent<{ id: number; payload: DiffWorkerRequest }>) => {
  const start = performance.now();
  const { id, payload } = event.data;
  const { original, modified, ignoreWhitespace, ignoreCase } = payload;

  try {
    const oldLines = original.replace(/\r\n/g, '\n').split('\n');
    const newLines = modified.replace(/\r\n/g, '\n').split('\n');

    const n = oldLines.length;
    const m = newLines.length;

    const normOld = oldLines.map((l) => normalizeLine(l, ignoreWhitespace, ignoreCase));
    const normNew = newLines.map((l) => normalizeLine(l, ignoreWhitespace, ignoreCase));

    // Trim common prefix and suffix lines first for O(1) fast path on large files
    let startIdx = 0;
    while (startIdx < n && startIdx < m && normOld[startIdx] === normNew[startIdx]) {
      startIdx++;
    }

    let endOld = n - 1;
    let endNew = m - 1;
    while (endOld >= startIdx && endNew >= startIdx && normOld[endOld] === normNew[endNew]) {
      endOld--;
      endNew--;
    }

    const midOld = oldLines.slice(startIdx, endOld + 1);
    const midNew = newLines.slice(startIdx, endNew + 1);
    const normMidOld = normOld.slice(startIdx, endOld + 1);
    const normMidNew = normNew.slice(startIdx, endNew + 1);

    const rawOps: Array<{ type: 'equal' | 'add' | 'remove'; oldIdx?: number; newIdx?: number }> = [];

    // Prefix equals
    for (let i = 0; i < startIdx; i++) {
      rawOps.push({ type: 'equal', oldIdx: i, newIdx: i });
    }

    const midN = midOld.length;
    const midM = midNew.length;

    if (midN * midM <= 2_500_000) {
      // Standard LCS dynamic programming matrix using flat Uint16/Uint32Array
      const cols = midM + 1;
      const dp = new Int32Array((midN + 1) * cols);

      for (let i = midN - 1; i >= 0; i--) {
        const rowOffset = i * cols;
        const nextRowOffset = (i + 1) * cols;
        for (let j = midM - 1; j >= 0; j--) {
          if (normMidOld[i] === normMidNew[j]) {
            dp[rowOffset + j] = 1 + dp[nextRowOffset + j + 1];
          } else {
            const down = dp[nextRowOffset + j];
            const right = dp[rowOffset + j + 1];
            dp[rowOffset + j] = down >= right ? down : right;
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < midN && j < midM) {
        if (normMidOld[i] === normMidNew[j]) {
          rawOps.push({ type: 'equal', oldIdx: startIdx + i, newIdx: startIdx + j });
          i++;
          j++;
        } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
          rawOps.push({ type: 'remove', oldIdx: startIdx + i });
          i++;
        } else {
          rawOps.push({ type: 'add', newIdx: startIdx + j });
          j++;
        }
      }
      while (i < midN) {
        rawOps.push({ type: 'remove', oldIdx: startIdx + i });
        i++;
      }
      while (j < midM) {
        rawOps.push({ type: 'add', newIdx: startIdx + j });
        j++;
      }
    } else {
      // Linear-space greedy lookahead for massive >1500-line diffs
      let i = 0;
      let j = 0;
      const lookahead = 32;
      while (i < midN && j < midM) {
        if (normMidOld[i] === normMidNew[j]) {
          rawOps.push({ type: 'equal', oldIdx: startIdx + i, newIdx: startIdx + j });
          i++;
          j++;
        } else {
          let foundOld = -1;
          let foundNew = -1;
          for (let k = 1; k < lookahead; k++) {
            if (i + k < midN && normMidOld[i + k] === normMidNew[j]) {
              foundOld = i + k;
              break;
            }
            if (j + k < midM && normMidOld[i] === normMidNew[j + k]) {
              foundNew = j + k;
              break;
            }
          }
          if (foundOld !== -1) {
            while (i < foundOld) {
              rawOps.push({ type: 'remove', oldIdx: startIdx + i });
              i++;
            }
          } else if (foundNew !== -1) {
            while (j < foundNew) {
              rawOps.push({ type: 'add', newIdx: startIdx + j });
              j++;
            }
          } else {
            rawOps.push({ type: 'remove', oldIdx: startIdx + i });
            rawOps.push({ type: 'add', newIdx: startIdx + j });
            i++;
            j++;
          }
        }
      }
      while (i < midN) {
        rawOps.push({ type: 'remove', oldIdx: startIdx + i });
        i++;
      }
      while (j < midM) {
        rawOps.push({ type: 'add', newIdx: startIdx + j });
        j++;
      }
    }

    // Suffix equals
    const suffixCount = n - 1 - endOld;
    for (let k = 1; k <= suffixCount; k++) {
      rawOps.push({
        type: 'equal',
        oldIdx: endOld + k,
        newIdx: endNew + k,
      });
    }

    const unified: UnifiedDiffLine[] = [];
    const split: SplitDiffRow[] = [];
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    let idx = 0;
    while (idx < rawOps.length) {
      const op = rawOps[idx];
      if (op.type === 'equal') {
        const oIdx = op.oldIdx!;
        const nIdx = op.newIdx!;
        unchanged++;
        unified.push({
          type: 'equal',
          oldLineNumber: oIdx + 1,
          newLineNumber: nIdx + 1,
          content: oldLines[oIdx],
        });
        split.push({
          leftLineNumber: oIdx + 1,
          leftContent: oldLines[oIdx],
          leftType: 'equal',
          rightLineNumber: nIdx + 1,
          rightContent: newLines[nIdx],
          rightType: 'equal',
        });
        idx++;
      } else {
        // Collect consecutive remove and add blocks to pair them up for side-by-side & char-level diff
        const removals: number[] = [];
        const additions: number[] = [];
        while (idx < rawOps.length && rawOps[idx].type !== 'equal') {
          if (rawOps[idx].type === 'remove') {
            removals.push(rawOps[idx].oldIdx!);
          } else {
            additions.push(rawOps[idx].newIdx!);
          }
          idx++;
        }

        removed += removals.length;
        added += additions.length;

        const maxBlock = Math.max(removals.length, additions.length);
        const removeSegmentsMap = new Map<number, DiffCharSegment[]>();
        const addSegmentsMap = new Map<number, DiffCharSegment[]>();

        for (let b = 0; b < maxBlock; b++) {
          const rLineIdx = b < removals.length ? removals[b] : null;
          const aLineIdx = b < additions.length ? additions[b] : null;

          let leftSegments: DiffCharSegment[] | undefined;
          let rightSegments: DiffCharSegment[] | undefined;

          if (rLineIdx !== null && aLineIdx !== null) {
            const segs = computeIntraLineSegments(oldLines[rLineIdx], newLines[aLineIdx]);
            leftSegments = segs.oldSegments;
            rightSegments = segs.newSegments;
            removeSegmentsMap.set(rLineIdx, leftSegments);
            addSegmentsMap.set(aLineIdx, rightSegments);
          }

          split.push({
            leftLineNumber: rLineIdx !== null ? rLineIdx + 1 : null,
            leftContent: rLineIdx !== null ? oldLines[rLineIdx] : '',
            leftType: rLineIdx !== null ? 'remove' : 'empty',
            leftSegments,
            rightLineNumber: aLineIdx !== null ? aLineIdx + 1 : null,
            rightContent: aLineIdx !== null ? newLines[aLineIdx] : '',
            rightType: aLineIdx !== null ? 'add' : 'empty',
            rightSegments,
          });
        }

        for (const rLineIdx of removals) {
          unified.push({
            type: 'remove',
            oldLineNumber: rLineIdx + 1,
            newLineNumber: null,
            content: oldLines[rLineIdx],
            segments: removeSegmentsMap.get(rLineIdx),
          });
        }
        for (const aLineIdx of additions) {
          unified.push({
            type: 'add',
            oldLineNumber: null,
            newLineNumber: aLineIdx + 1,
            content: newLines[aLineIdx],
            segments: addSegmentsMap.get(aLineIdx),
          });
        }
      }
    }

    const result: DiffWorkerResult = {
      unified,
      split,
      added,
      removed,
      unchanged,
      identical: added === 0 && removed === 0,
    };

    self.postMessage({
      id,
      ok: true,
      result,
      durationMs: performance.now() - start,
    });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - start,
    });
  }
};
