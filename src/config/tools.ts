import type { LucideIcon } from 'lucide-react';
import {
  Layers,
  Box,
  Image,
  FileSpreadsheet,
  Film,
  Archive,
  Braces,
  ShieldCheck,
  GitCompareArrows,
  Fingerprint,
  Regex,
  ImageDown,
} from 'lucide-react';
import type { TranslationKey } from '../hooks/useI18n';

export type ToolId =
  | 'universal-hub'
  | 'cad-3d'
  | 'media-images'
  | 'documents'
  | 'audio-video'
  | 'archives-fonts'
  | 'json-studio'
  | 'jwt-inspector'
  | 'diff-checker'
  | 'crypto-hasher'
  | 'regex-lab'
  | 'image-optimizer';

export type TopNavCategoryId =
  | 'all'
  | 'cad-3d'
  | 'images'
  | 'documents'
  | 'audio-video'
  | 'archives-fonts'
  | 'dev-tools';

export type ToolCategoryId =
  | 'all'
  | 'cad3d'
  | 'images'
  | 'documents'
  | 'audioVideo'
  | 'archivesFonts'
  | 'data'
  | 'security'
  | 'text'
  | 'media';

export interface TopNavCategory {
  id: TopNavCategoryId;
  labelKey: TranslationKey;
  defaultToolId: ToolId;
}

export const TOP_NAV_CATEGORIES: TopNavCategory[] = [
  { id: 'all', labelKey: 'nav.all', defaultToolId: 'universal-hub' },
  { id: 'cad-3d', labelKey: 'nav.cad3d', defaultToolId: 'cad-3d' },
  { id: 'images', labelKey: 'nav.images', defaultToolId: 'media-images' },
  { id: 'documents', labelKey: 'nav.documents', defaultToolId: 'documents' },
  { id: 'audio-video', labelKey: 'nav.audioVideo', defaultToolId: 'audio-video' },
  { id: 'archives-fonts', labelKey: 'nav.archivesFonts', defaultToolId: 'archives-fonts' },
  { id: 'dev-tools', labelKey: 'nav.devTools', defaultToolId: 'json-studio' },
];

export interface ToolRegistryEntry {
  id: ToolId;
  topNav: TopNavCategoryId;
  category: ToolCategoryId;
  nameKey: TranslationKey;
  descKey: TranslationKey;
  icon: LucideIcon;
  shortcut: string;
  keywords: string[];
  formats?: string[];
}

export interface CategoryMetadata {
  id: ToolCategoryId;
  labelKey: TranslationKey;
}

export const TOOL_CATEGORIES: CategoryMetadata[] = [
  { id: 'all', labelKey: 'category.all' },
  { id: 'cad3d', labelKey: 'category.cad3d' },
  { id: 'images', labelKey: 'category.images' },
  { id: 'documents', labelKey: 'category.documents' },
  { id: 'audioVideo', labelKey: 'category.audioVideo' },
  { id: 'archivesFonts', labelKey: 'category.archivesFonts' },
  { id: 'data', labelKey: 'category.data' },
  { id: 'security', labelKey: 'category.security' },
  { id: 'text', labelKey: 'category.text' },
];

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    id: 'universal-hub',
    topNav: 'all',
    category: 'all',
    nameKey: 'hub.title',
    descKey: 'hub.subtitle',
    icon: Layers,
    shortcut: 'Alt+0',
    keywords: ['dropzone', 'batch', 'auto', 'detect', 'zip', 'queue', 'universal', 'convert'],
    formats: ['ANY', 'BATCH', 'ZIP'],
  },
  {
    id: 'cad-3d',
    topNav: 'cad-3d',
    category: 'cad3d',
    nameKey: 'tools.cad3d.name',
    descKey: 'tools.cad3d.desc',
    icon: Box,
    shortcut: 'Alt+1',
    keywords: ['3d', 'cad', '3mf', 'stl', 'obj', 'ply', 'gltf', 'glb', 'mesh', 'normals', 'wireframe'],
    formats: ['3MF', 'STL', 'OBJ', 'PLY', 'GLTF', 'GLB'],
  },
  {
    id: 'media-images',
    topNav: 'images',
    category: 'images',
    nameKey: 'tools.mediaImages.name',
    descKey: 'tools.mediaImages.desc',
    icon: Image,
    shortcut: 'Alt+2',
    keywords: ['image', 'webp', 'png', 'jpg', 'bmp', 'tiff', 'heic', 'heif', 'svg', 'ico', 'exif'],
    formats: ['WebP', 'PNG', 'JPG', 'BMP', 'TIFF', 'HEIC', 'SVG', 'ICO'],
  },
  {
    id: 'documents',
    topNav: 'documents',
    category: 'documents',
    nameKey: 'tools.documents.name',
    descKey: 'tools.documents.desc',
    icon: FileSpreadsheet,
    shortcut: 'Alt+3',
    keywords: ['pdf', 'excel', 'xlsx', 'xls', 'csv', 'tsv', 'json', 'html', 'table', 'merge', 'split'],
    formats: ['PDF', 'XLSX', 'CSV', 'TSV', 'JSON', 'HTML'],
  },
  {
    id: 'audio-video',
    topNav: 'audio-video',
    category: 'audioVideo',
    nameKey: 'tools.audioVideo.name',
    descKey: 'tools.audioVideo.desc',
    icon: Film,
    shortcut: 'Alt+4',
    keywords: ['audio', 'video', 'wav', 'mp3', 'ogg', 'aac', 'flac', 'mp4', 'webm', 'mkv', 'gif'],
    formats: ['WAV', 'MP3', 'OGG', 'AAC', 'FLAC', 'MP4', 'WebM', 'GIF'],
  },
  {
    id: 'archives-fonts',
    topNav: 'archives-fonts',
    category: 'archivesFonts',
    nameKey: 'tools.archivesFonts.name',
    descKey: 'tools.archivesFonts.desc',
    icon: Archive,
    shortcut: 'Alt+5',
    keywords: ['zip', 'tar', 'gz', 'archive', 'font', 'ttf', 'otf', 'woff', 'woff2', 'glyph'],
    formats: ['ZIP', 'TAR', 'GZ', 'TTF', 'OTF', 'WOFF', 'WOFF2'],
  },
  {
    id: 'json-studio',
    topNav: 'dev-tools',
    category: 'data',
    nameKey: 'tools.jsonStudio.name',
    descKey: 'tools.jsonStudio.desc',
    icon: Braces,
    shortcut: 'Alt+6',
    keywords: ['json', 'prettify', 'minify', 'tree', 'jsonpath', 'validate', 'parse', 'format'],
    formats: ['JSON', 'JSONPath'],
  },
  {
    id: 'jwt-inspector',
    topNav: 'dev-tools',
    category: 'security',
    nameKey: 'tools.jwtInspector.name',
    descKey: 'tools.jwtInspector.desc',
    icon: ShieldCheck,
    shortcut: 'Alt+7',
    keywords: ['jwt', 'token', 'bearer', 'hmac', 'hs256', 'claims', 'exp', 'signature', 'auth'],
    formats: ['JWT', 'HMAC'],
  },
  {
    id: 'diff-checker',
    topNav: 'dev-tools',
    category: 'text',
    nameKey: 'tools.diffChecker.name',
    descKey: 'tools.diffChecker.desc',
    icon: GitCompareArrows,
    shortcut: 'Alt+8',
    keywords: ['diff', 'compare', 'git', 'patch', 'unified', 'side-by-side', 'delta', 'merge'],
    formats: ['DIFF', 'PATCH'],
  },
  {
    id: 'crypto-hasher',
    topNav: 'dev-tools',
    category: 'security',
    nameKey: 'tools.cryptoHasher.name',
    descKey: 'tools.cryptoHasher.desc',
    icon: Fingerprint,
    shortcut: 'Alt+9',
    keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'hmac', 'uuid', 'v4', 'crypto', 'digest'],
    formats: ['SHA-256', 'MD5', 'UUID'],
  },
  {
    id: 'regex-lab',
    topNav: 'dev-tools',
    category: 'text',
    nameKey: 'tools.regexLab.name',
    descKey: 'tools.regexLab.desc',
    icon: Regex,
    shortcut: 'Alt+R',
    keywords: ['regex', 'regexp', 'pattern', 'capture', 'replace', 'case', 'camelcase', 'snakecase'],
    formats: ['RegExp', 'Text'],
  },
  {
    id: 'image-optimizer',
    topNav: 'dev-tools',
    category: 'media',
    nameKey: 'tools.imageOptimizer.name',
    descKey: 'tools.imageOptimizer.desc',
    icon: ImageDown,
    shortcut: 'Alt+I',
    keywords: ['svg', 'jsx', 'inline', 'minify', 'vector'],
    formats: ['SVG', 'JSX'],
  },
];

export function getToolById(id: ToolId): ToolRegistryEntry {
  return TOOL_REGISTRY.find((t) => t.id === id) ?? TOOL_REGISTRY[0];
}
