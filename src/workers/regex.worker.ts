/// <reference lib="webworker" />

export interface RegexCaptureGroup {
  index: number;
  name?: string;
  value: string;
}

export interface RegexMatchEntry {
  matchIndex: number;
  fullMatch: string;
  start: number;
  end: number;
  groups: RegexCaptureGroup[];
}

export interface RegexWorkerRequest {
  pattern: string;
  flags: string;
  testString: string;
  replacement: string;
}

export interface RegexWorkerResult {
  valid: boolean;
  error?: string;
  matches: RegexMatchEntry[];
  totalCaptures: number;
  replacedOutput: string;
  transforms: {
    camelCase: string;
    pascalCase: string;
    snakeCase: string;
    kebabCase: string;
    constantCase: string;
    titleCase: string;
    sortedLines: string;
    dedupedLines: string;
    trimmedLines: string;
    base64Encoded: string;
  };
}

function splitWords(line: string): string[] {
  return line
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./\\]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function transformLines(input: string, fn: (words: string[], rawLine: string) => string): string {
  return input
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '';
      const words = splitWords(line);
      return words.length > 0 ? fn(words, line) : line;
    })
    .join('\n');
}

function utf8ToBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return '';
  }
}

self.onmessage = (event: MessageEvent<{ id: number; payload: RegexWorkerRequest }>) => {
  const start = performance.now();
  const { id, payload } = event.data;
  const { pattern, flags, testString, replacement } = payload;

  try {
    const lines = testString.replace(/\r\n/g, '\n').split('\n');
    const trimmedArr = lines.map((l) => l.trim()).filter(Boolean);
    const uniqueArr = Array.from(new Set(trimmedArr));
    const sortedArr = [...trimmedArr].sort((a, b) => a.localeCompare(b));

    const transforms = {
      camelCase: transformLines(testString, (words) =>
        words
          .map((w, i) =>
            i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          )
          .join('')
      ),
      pascalCase: transformLines(testString, (words) =>
        words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
      ),
      snakeCase: transformLines(testString, (words) =>
        words.map((w) => w.toLowerCase()).join('_')
      ),
      kebabCase: transformLines(testString, (words) =>
        words.map((w) => w.toLowerCase()).join('-')
      ),
      constantCase: transformLines(testString, (words) =>
        words.map((w) => w.toUpperCase()).join('_')
      ),
      titleCase: transformLines(testString, (words) =>
        words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      ),
      sortedLines: sortedArr.join('\n'),
      dedupedLines: uniqueArr.join('\n'),
      trimmedLines: trimmedArr.join('\n'),
      base64Encoded: utf8ToBase64(testString),
    };

    if (!pattern) {
      const result: RegexWorkerResult = {
        valid: true,
        matches: [],
        totalCaptures: 0,
        replacedOutput: testString,
        transforms,
      };
      self.postMessage({ id, ok: true, result, durationMs: performance.now() - start });
      return;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (regexErr) {
      const result: RegexWorkerResult = {
        valid: false,
        error: regexErr instanceof Error ? regexErr.message : String(regexErr),
        matches: [],
        totalCaptures: 0,
        replacedOutput: testString,
        transforms,
      };
      self.postMessage({ id, ok: true, result, durationMs: performance.now() - start });
      return;
    }

    const matches: RegexMatchEntry[] = [];
    let totalCaptures = 0;
    const maxMatches = 5000;

    if (flags.includes('g')) {
      let m: RegExpExecArray | null;
      let safetyCounter = 0;
      while ((m = regex.exec(testString)) !== null && safetyCounter < maxMatches) {
        safetyCounter++;
        const groups: RegexCaptureGroup[] = [];
        for (let gIdx = 1; gIdx < m.length; gIdx++) {
          if (m[gIdx] !== undefined) {
            groups.push({ index: gIdx, value: m[gIdx] });
            totalCaptures++;
          }
        }
        if (m.groups) {
          for (const [name, val] of Object.entries(m.groups)) {
            if (val !== undefined) {
              const existing = groups.find((g) => g.value === val && !g.name);
              if (existing) {
                existing.name = name;
              } else {
                groups.push({ index: groups.length + 1, name, value: val });
              }
            }
          }
        }
        matches.push({
          matchIndex: matches.length + 1,
          fullMatch: m[0],
          start: m.index,
          end: m.index + m[0].length,
          groups,
        });
        if (m[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else {
      const m = regex.exec(testString);
      if (m) {
        const groups: RegexCaptureGroup[] = [];
        for (let gIdx = 1; gIdx < m.length; gIdx++) {
          if (m[gIdx] !== undefined) {
            groups.push({ index: gIdx, value: m[gIdx] });
            totalCaptures++;
          }
        }
        matches.push({
          matchIndex: 1,
          fullMatch: m[0],
          start: m.index,
          end: m.index + m[0].length,
          groups,
        });
      }
    }

    const replacedOutput = testString.replace(new RegExp(pattern, flags), replacement);

    const result: RegexWorkerResult = {
      valid: true,
      matches,
      totalCaptures,
      replacedOutput,
      transforms,
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
