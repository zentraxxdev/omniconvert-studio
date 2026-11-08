/// <reference lib="webworker" />

export interface JsonTreeItem {
  id: string;
  path: string;
  key: string | null;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  valuePreview: string;
  depth: number;
  hasChildren: boolean;
  childCount: number;
  parentPath: string | null;
}

export interface JsonWorkerRequest {
  raw: string;
  indent: 0 | 2 | 4;
  sortKeys: boolean;
  jsonPath: string;
}

export interface JsonSyntaxErrorDetails {
  message: string;
  line: number;
  column: number;
  errorLineText: string;
}

export interface JsonWorkerResult {
  valid: boolean;
  formatted: string;
  treeNodes: JsonTreeItem[];
  totalNodes: number;
  byteSize: number;
  error?: JsonSyntaxErrorDetails;
}

function extractLineAndColumn(raw: string, errorMessage: string): JsonSyntaxErrorDetails {
  // Match "position N" or "line L column C" from JS engine JSON.parse error message
  const lineColMatch = errorMessage.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  const posMatch = errorMessage.match(/position\s+(\d+)/i);

  let line = 1;
  let column = 1;

  if (lineColMatch) {
    line = Math.max(1, parseInt(lineColMatch[1], 10));
    column = Math.max(1, parseInt(lineColMatch[2], 10));
  } else if (posMatch) {
    const pos = Math.min(raw.length, Math.max(0, parseInt(posMatch[1], 10)));
    for (let i = 0; i < pos; i++) {
      if (raw[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
  } else {
    // Fallback scanner to approximate error position
    const lines = raw.split('\n');
    line = lines.length;
    column = (lines[lines.length - 1]?.length ?? 0) + 1;
  }

  const lines = raw.split('\n');
  const errorLineText = lines[Math.min(lines.length - 1, Math.max(0, line - 1))] ?? '';

  return {
    message: errorMessage.replace(/^JSON\.parse:\s*/i, ''),
    line,
    column,
    errorLineText: errorLineText.slice(0, 160),
  };
}

function sortObjectKeysRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeysRecursively);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
    for (const k of keys) {
      sorted[k] = sortObjectKeysRecursively((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

function evaluateJsonPath(root: unknown, query: string): unknown {
  const trimmed = query.trim();
  if (!trimmed || trimmed === '$') return root;

  // Support comma-separated key filter shorthand (e.g., "id,name,role")
  if (!trimmed.startsWith('$') && !trimmed.startsWith('.')) {
    const allowedKeys = new Set(
      trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (allowedKeys.size > 0 && root !== null && typeof root === 'object' && !Array.isArray(root)) {
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(root as Record<string, unknown>)) {
        if (allowedKeys.has(k)) filtered[k] = v;
      }
      return filtered;
    }
  }

  // Normalize path starting with $
  let expr = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;

  // Handle recursive descent $..key
  if (expr.startsWith('..')) {
    const targetKey = expr.slice(2).trim();
    if (!targetKey) return root;
    const matches: unknown[] = [];
    const visit = (node: unknown) => {
      if (node !== null && typeof node === 'object') {
        if (Array.isArray(node)) {
          for (const item of node) visit(item);
        } else {
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (k === targetKey) matches.push(v);
            visit(v);
          }
        }
      }
    };
    visit(root);
    return matches;
  }

  // Tokenize standard JSONPath segments: .key, ['key'], [0], [*], [?(@.prop == val)]
  const tokens: string[] = [];
  const tokenRegex = /\.([a-zA-Z0-9_-]+|\*)|\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(expr)) !== null) {
    tokens.push(match[1] ?? match[2]);
  }

  if (tokens.length === 0 && expr.startsWith('.')) {
    tokens.push(expr.slice(1));
  }

  let current: unknown[] = [root];

  for (const rawToken of tokens) {
    const token = rawToken.trim().replace(/^['"]|['"]$/g, '');
    const nextBatch: unknown[] = [];

    for (const item of current) {
      if (item === null || item === undefined) continue;

      if (token === '*') {
        if (Array.isArray(item)) {
          nextBatch.push(...item);
        } else if (typeof item === 'object') {
          nextBatch.push(...Object.values(item as Record<string, unknown>));
        }
      } else if (token.startsWith('?(') && token.endsWith(')')) {
        // Filter expression: ?(@.active == true) or ?(@.latencyMs < 1.2)
        const cond = token.slice(2, -1).trim();
        const filterMatch = cond.match(/^@\.([a-zA-Z0-9_]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        if (filterMatch && Array.isArray(item)) {
          const [, prop, op, rhsRaw] = filterMatch;
          const rhsClean = rhsRaw.trim().replace(/^['"]|['"]$/g, '');
          for (const elem of item) {
            if (elem !== null && typeof elem === 'object') {
              const lhs = (elem as Record<string, unknown>)[prop];
              const lhsStr = String(lhs);
              const lhsNum = Number(lhs);
              const rhsNum = Number(rhsClean);
              let pass = false;
              if (op === '==') pass = lhsStr === rhsClean;
              else if (op === '!=') pass = lhsStr !== rhsClean;
              else if (!Number.isNaN(lhsNum) && !Number.isNaN(rhsNum)) {
                if (op === '>') pass = lhsNum > rhsNum;
                else if (op === '<') pass = lhsNum < rhsNum;
                else if (op === '>=') pass = lhsNum >= rhsNum;
                else if (op === '<=') pass = lhsNum <= rhsNum;
              }
              if (pass) nextBatch.push(elem);
            }
          }
        }
      } else if (/^\d+$/.test(token) && Array.isArray(item)) {
        const idx = parseInt(token, 10);
        if (idx >= 0 && idx < item.length) {
          nextBatch.push(item[idx]);
        }
      } else if (typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        if (token in record) {
          nextBatch.push(record[token]);
        }
      }
    }

    current = nextBatch;
  }

  return current.length === 1 ? current[0] : current;
}

function buildFlattenedTree(root: unknown, maxNodes = 25000): { nodes: JsonTreeItem[]; totalCount: number } {
  const nodes: JsonTreeItem[] = [];
  let totalCount = 0;

  const traverse = (
    val: unknown,
    key: string | null,
    path: string,
    depth: number,
    parentPath: string | null
  ) => {
    totalCount++;
    if (nodes.length >= maxNodes) return;

    if (val === null) {
      nodes.push({
        id: path,
        path,
        key,
        type: 'null',
        valuePreview: 'null',
        depth,
        hasChildren: false,
        childCount: 0,
        parentPath,
      });
      return;
    }

    if (Array.isArray(val)) {
      nodes.push({
        id: path,
        path,
        key,
        type: 'array',
        valuePreview: `[${val.length}]`,
        depth,
        hasChildren: val.length > 0,
        childCount: val.length,
        parentPath,
      });
      for (let i = 0; i < val.length; i++) {
        traverse(val[i], String(i), `${path}[${i}]`, depth + 1, path);
      }
      return;
    }

    if (typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>);
      nodes.push({
        id: path,
        path,
        key,
        type: 'object',
        valuePreview: `{${entries.length}}`,
        depth,
        hasChildren: entries.length > 0,
        childCount: entries.length,
        parentPath,
      });
      for (const [k, v] of entries) {
        const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? `${path}.${k}` : `${path}["${k}"]`;
        traverse(v, k, childPath, depth + 1, path);
      }
      return;
    }

    const primitiveType = typeof val as 'string' | 'number' | 'boolean';
    const preview =
      primitiveType === 'string'
        ? JSON.stringify(String(val).length > 120 ? `${String(val).slice(0, 120)}…` : val)
        : String(val);

    nodes.push({
      id: path,
      path,
      key,
      type: primitiveType,
      valuePreview: preview,
      depth,
      hasChildren: false,
      childCount: 0,
      parentPath,
    });
  };

  traverse(root, null, '$', 0, null);
  return { nodes, totalCount };
}

self.onmessage = (event: MessageEvent<{ id: number; payload: JsonWorkerRequest }>) => {
  const start = performance.now();
  const { id, payload } = event.data;
  const { raw, indent, sortKeys, jsonPath } = payload;

  try {
    const trimmed = raw.trim();
    if (!trimmed) {
      const result: JsonWorkerResult = {
        valid: true,
        formatted: '',
        treeNodes: [],
        totalNodes: 0,
        byteSize: 0,
      };
      self.postMessage({ id, ok: true, result, durationMs: performance.now() - start });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      const errMessage = parseErr instanceof Error ? parseErr.message : String(parseErr);
      const syntaxError = extractLineAndColumn(raw, errMessage);
      const result: JsonWorkerResult = {
        valid: false,
        formatted: '',
        treeNodes: [],
        totalNodes: 0,
        byteSize: new TextEncoder().encode(raw).byteLength,
        error: syntaxError,
      };
      self.postMessage({ id, ok: true, result, durationMs: performance.now() - start });
      return;
    }

    const queried = jsonPath.trim() ? evaluateJsonPath(parsed, jsonPath) : parsed;
    const processed = sortKeys ? sortObjectKeysRecursively(queried) : queried;
    const formatted =
      indent === 0 ? JSON.stringify(processed) : JSON.stringify(processed, null, indent);
    const { nodes, totalCount } = buildFlattenedTree(processed);
    const byteSize = new TextEncoder().encode(formatted || '').byteLength;

    const result: JsonWorkerResult = {
      valid: true,
      formatted: formatted ?? 'undefined',
      treeNodes: nodes,
      totalNodes: totalCount,
      byteSize,
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
