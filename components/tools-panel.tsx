'use client';
import React from 'react';
import FileSearchSetup from './file-search-setup';
import WebSearchConfig from './websearch-config';
import McpConfig from './mcp-config';
import PanelConfig from './panel-config';
import useToolsStore from '@/stores/useToolsStore';
import GoogleIntegrationPanel from '@/components/google-integration';

export default function ContextPanel() {
  const {
    fileSearchEnabled,
    setFileSearchEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    googleIntegrationEnabled,
    setGoogleIntegrationEnabled,
    mcpEnabled,
    setMcpEnabled,
  } = useToolsStore();
  const [oauthConfigured, setOauthConfigured] = React.useState<boolean>(false);

  React.useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((d) => setOauthConfigured(Boolean(d.oauthConfigured)))
      .catch(() => setOauthConfigured(false));
  }, []);
  return (
    <div className="h-full p-8 w-full bg-[#f9f9f9] rounded-t-xl md:rounded-none border-l-1 border-stone-100">
      <div className="flex flex-col overflow-y-scroll h-full">
        <PanelConfig
          title="File Search"
          tooltip="Allows to search a knowledge base (vector store)"
          enabled={fileSearchEnabled}
          setEnabled={setFileSearchEnabled}
        >
          <FileSearchSetup />
        </PanelConfig>
        <PanelConfig
          title="Web Search"
          tooltip="Allows to search the web"
          enabled={webSearchEnabled}
          setEnabled={setWebSearchEnabled}
        >
          <WebSearchConfig />
        </PanelConfig>
        <PanelConfig
          title="MCP"
          tooltip="Allows to call tools via remote MCP server"
          enabled={mcpEnabled}
          setEnabled={setMcpEnabled}
        >
          <McpConfig />
        </PanelConfig>
        <PanelConfig
          title="Google Integration"
          tooltip="Connect your Google account to enable Gmail and Calendar features."
          enabled={oauthConfigured && googleIntegrationEnabled}
          setEnabled={setGoogleIntegrationEnabled}
          disabled={!oauthConfigured}
        >
          <GoogleIntegrationPanel />
        </PanelConfig>
      </div>
    </div>
  );
}
