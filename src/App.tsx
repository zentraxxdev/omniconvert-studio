import React, { useEffect } from 'react';
import { Shell } from './components/Shell';
import { useWorkspaceStore } from './hooks/useWorkspaceStore';
import { UniversalHubTool } from './tools/universal-hub';
import { Cad3dTool } from './tools/cad-3d';
import { MediaImagesTool } from './tools/media-images';
import { DocumentsTool } from './tools/documents';
import { AudioVideoTool } from './tools/audio-video';
import { ArchivesFontsTool } from './tools/archives-fonts';
import { JsonStudioTool } from './tools/json-studio';
import { JwtInspectorTool } from './tools/jwt-inspector';
import { DiffCheckerTool } from './tools/diff-checker';
import { CryptoHasherTool } from './tools/crypto-hasher';
import { RegexLabTool } from './tools/regex-lab';
import { ImageOptimizerTool } from './tools/image-optimizer';

export const App: React.FC = () => {
  const activeToolId = useWorkspaceStore((s) => s.activeToolId);
  const hydrateFromIndexedDB = useWorkspaceStore((s) => s.hydrateFromIndexedDB);

  useEffect(() => {
    void hydrateFromIndexedDB();
  }, [hydrateFromIndexedDB]);

  return (
    <Shell>
      {activeToolId === 'universal-hub' && <UniversalHubTool />}
      {activeToolId === 'cad-3d' && <Cad3dTool />}
      {activeToolId === 'media-images' && <MediaImagesTool />}
      {activeToolId === 'documents' && <DocumentsTool />}
      {activeToolId === 'audio-video' && <AudioVideoTool />}
      {activeToolId === 'archives-fonts' && <ArchivesFontsTool />}
      {activeToolId === 'json-studio' && <JsonStudioTool />}
      {activeToolId === 'jwt-inspector' && <JwtInspectorTool />}
      {activeToolId === 'diff-checker' && <DiffCheckerTool />}
      {activeToolId === 'crypto-hasher' && <CryptoHasherTool />}
      {activeToolId === 'regex-lab' && <RegexLabTool />}
      {activeToolId === 'image-optimizer' && <ImageOptimizerTool />}
    </Shell>
  );
};

export default App;
