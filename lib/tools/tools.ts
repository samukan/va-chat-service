import { toolsList } from '../../config/tools-list';
import { ToolsState, WebSearchConfig } from '@/stores/useToolsStore';

interface WebSearchTool extends WebSearchConfig {
  type: 'web_search';
}

export const getTools = async (toolsState: ToolsState) => {
  const {
    webSearchEnabled,
    fileSearchEnabled,
    functionsEnabled,
    codeInterpreterEnabled,
    vectorStore,
    webSearchConfig,
    mcpEnabled,
    mcpConfig,
  } = toolsState;

  const tools = [];

  if (webSearchEnabled) {
    const webSearchTool: WebSearchTool = {
      type: 'web_search',
    };
    if (
      webSearchConfig.user_location &&
      (webSearchConfig.user_location.country !== '' ||
        webSearchConfig.user_location.region !== '' ||
        webSearchConfig.user_location.city !== '')
    ) {
      webSearchTool.user_location = webSearchConfig.user_location;
    }

    tools.push(webSearchTool);
  }

  if (fileSearchEnabled && vectorStore?.id) {
    const fileSearchTool = {
      type: 'file_search',
      vector_store_ids: [vectorStore.id],
    };
    tools.push(fileSearchTool);
  } else if (fileSearchEnabled && !vectorStore?.id) {
    console.warn(
      'File search enabled but no vector store configured. Skipping file search tool.'
    );
  }

  if (codeInterpreterEnabled) {
    tools.push({ type: 'code_interpreter', container: { type: 'auto' } });
  }

  if (functionsEnabled) {
    tools.push(
      ...toolsList.map((tool) => {
        return {
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: { ...tool.parameters },
            required: Object.keys(tool.parameters),
            additionalProperties: false,
          },
          strict: true,
        };
      })
    );
  }

  if (mcpEnabled && mcpConfig.server_url && mcpConfig.server_label) {
    const mcpTool: any = {
      type: 'mcp',
      server_label: mcpConfig.server_label,
      server_url: mcpConfig.server_url,
    };
    if (mcpConfig.skip_approval) {
      mcpTool.require_approval = 'never';
    }
    if (mcpConfig.allowed_tools.trim()) {
      mcpTool.allowed_tools = mcpConfig.allowed_tools
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);
    }
    tools.push(mcpTool);
  }

  return tools;
};
