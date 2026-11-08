/// <reference lib="webworker" />
import JSZip from 'jszip';

export type TabularFormat = 'csv' | 'tsv' | 'json' | 'html' | 'xlsx';

export interface TabularWorkerRequest {
  action: 'convert' | 'splitCsv';
  rawText?: string;
  xlsxBuffer?: ArrayBuffer;
  sourceFormat?: 'csv' | 'tsv' | 'json' | 'xlsx';
  targetFormat: TabularFormat;
  chunkRows?: number;
}

export interface TabularWorkerResult {
  headers: string[];
  rows: string[][];
  outputText: string;
  outputBytes?: Uint8Array;
  chunkCount?: number;
}

function parseDelimited(text: string, delimiter: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

function parseJsonTabular(text: string): { headers: string[]; rows: string[][] } {
  const parsed = JSON.parse(text) as unknown;
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const keySet = new Set<string>();
  for (const item of arr) {
    if (item && typeof item === 'object') {
      for (const k of Object.keys(item as Record<string, unknown>)) keySet.add(k);
    }
  }
  const headers = Array.from(keySet);
  const rows = arr.map((item) => {
    if (!item || typeof item !== 'object') return headers.map(() => '');
    const rec = item as Record<string, unknown>;
    return headers.map((h) =>
      rec[h] === undefined || rec[h] === null
        ? ''
        : typeof rec[h] === 'object'
        ? JSON.stringify(rec[h])
        : String(rec[h])
    );
  });
  return { headers, rows };
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings: string[] = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    const ssXml = await ssFile.async('string');
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/gi;
    let m: RegExpExecArray | null;
    while ((m = tRegex.exec(ssXml)) !== null) {
      sharedStrings.push(m[1]);
    }
  }

  const sheetFile =
    zip.file('xl/worksheets/sheet1.xml') ??
    Object.values(zip.files).find((f) => f.name.startsWith('xl/worksheets/sheet'));
  if (!sheetFile) return { headers: [], rows: [] };

  const sheetXml = await sheetFile.async('string');
  const allRows: string[][] = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rm[1];
    const cells: string[] = [];
    const cellRegex = /<c([^>]*)>([\s\S]*?)<\/c>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rowContent)) !== null) {
      const attrs = cm[1];
      const inner = cm[2];
      const isShared = /t="s"/.test(attrs);
      const valMatch = inner.match(/<v>([\s\S]*?)<\/v>/) ?? inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      const rawVal = valMatch ? valMatch[1] : '';
      if (isShared) {
        const idx = parseInt(rawVal, 10);
        cells.push(sharedStrings[idx] ?? rawVal);
      } else {
        cells.push(rawVal);
      }
    }
    if (cells.length > 0) allRows.push(cells);
  }

  if (allRows.length === 0) return { headers: [], rows: [] };
  return { headers: allRows[0], rows: allRows.slice(1) };
}

function serializeDelimited(headers: string[], rows: string[][], delimiter: string): string {
  const escapeCell = (val: string) => {
    if (val.includes(delimiter) || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [headers.map(escapeCell).join(delimiter)];
  for (const r of rows) {
    lines.push(headers.map((_, i) => escapeCell(r[i] ?? '')).join(delimiter));
  }
  return lines.join('\n');
}

function serializeHtmlTable(headers: string[], rows: string[][]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ths = headers.map((h) => `      <th>${esc(h)}</th>`).join('\n');
  const trs = rows
    .map(
      (r) =>
        `    <tr>\n${headers.map((_, i) => `      <td>${esc(r[i] ?? '')}</td>`).join('\n')}\n    </tr>`
    )
    .join('\n');
  return `<table>\n  <thead>\n    <tr>\n${ths}\n    </tr>\n  </thead>\n  <tbody>\n${trs}\n  </tbody>\n</table>`;
}

async function serializeXlsx(headers: string[], rows: string[][]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
  );

  const escXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const allData = [headers, ...rows];
  const xmlRows = allData
    .map((r, rIdx) => {
      const cells = r
        .map((val, cIdx) => {
          const colLetter = String.fromCharCode(65 + (cIdx % 26));
          const ref = `${colLetter}${rIdx + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escXml(val ?? '')}</t></is></c>`;
        })
        .join('');
      return `    <row r="${rIdx + 1}">${cells}</row>`;
    })
    .join('\n');

  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
${xmlRows}
  </sheetData>
</worksheet>`
  );

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

self.onmessage = async (event: MessageEvent<{ id: number; payload: TabularWorkerRequest }>) => {
  const start = performance.now();
  const { id, payload } = event.data;

  try {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (payload.xlsxBuffer) {
      const parsed = await parseXlsxBuffer(payload.xlsxBuffer);
      headers = parsed.headers;
      rows = parsed.rows;
    } else {
      const raw = (payload.rawText ?? '').trim();
      if (raw.startsWith('[') || raw.startsWith('{')) {
        const parsed = parseJsonTabular(raw);
        headers = parsed.headers;
        rows = parsed.rows;
      } else if (payload.sourceFormat === 'tsv' || (raw.includes('\t') && !raw.includes(','))) {
        const parsed = parseDelimited(raw, '\t');
        headers = parsed.headers;
        rows = parsed.rows;
      } else {
        const parsed = parseDelimited(raw, ',');
        headers = parsed.headers;
        rows = parsed.rows;
      }
    }

    if (payload.action === 'splitCsv') {
      const chunkSize = Math.max(1, payload.chunkRows ?? 500);
      const zip = new JSZip();
      let chunkCount = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        chunkCount++;
        const slice = rows.slice(i, i + chunkSize);
        const csvPart = serializeDelimited(headers, slice, ',');
        zip.file(`chunk_${String(chunkCount).padStart(3, '0')}.csv`, csvPart);
      }
      const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      const result: TabularWorkerResult = {
        headers,
        rows,
        outputText: `Split ${rows.length} rows into ${chunkCount} CSV chunks (${chunkSize} rows/chunk).`,
        outputBytes: zipBytes,
        chunkCount,
      };
      self.postMessage({ id, ok: true, result, durationMs: performance.now() - start });
      return;
    }

    let outputText = '';
    let outputBytes: Uint8Array | undefined;

    switch (payload.targetFormat) {
      case 'csv':
        outputText = serializeDelimited(headers, rows, ',');
        break;
      case 'tsv':
        outputText = serializeDelimited(headers, rows, '\t');
        break;
      case 'json': {
        const objs = rows.map((r) => {
          const obj: Record<string, string | number | boolean> = {};
          headers.forEach((h, idx) => {
            const v = r[idx] ?? '';
            if (v === 'true') obj[h] = true;
            else if (v === 'false') obj[h] = false;
            else if (v !== '' && !Number.isNaN(Number(v))) obj[h] = Number(v);
            else obj[h] = v;
          });
          return obj;
        });
        outputText = JSON.stringify(objs, null, 2);
        break;
      }
      case 'html':
        outputText = serializeHtmlTable(headers, rows);
        break;
      case 'xlsx':
        outputBytes = await serializeXlsx(headers, rows);
        outputText = serializeDelimited(headers, rows, ',');
        break;
    }

    const result: TabularWorkerResult = {
      headers,
      rows,
      outputText,
      outputBytes,
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
