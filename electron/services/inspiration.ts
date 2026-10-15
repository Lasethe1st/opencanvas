/** Registry of inspiration providers. Only providers with a working, authorised connection may return results. */
import type { InspirationBoard, InspirationProvider, InspirationProviderInfo, InspirationResult } from '../../shared/inspiration';
import type { SaveeClient } from './savee';

const DOCS = 'https://docs.savee.com/mcp/';

export function saveeProvider(client: SaveeClient | null): InspirationProvider {
  return {
    info: () => {
      const base = { id: 'savee', name: 'Savee', docsUrl: DOCS, workaround: null, canConnect: !!client };
      if (!client)
        return {
          ...base,
          status: 'unavailable',
          detail: 'This computer has no secure storage for the Savee sign-in, so OpenCanvas can’t connect to Savee.',
          workaround: 'Add Savee’s MCP server (https://mcp.savee.com/mcp) to Cursor or Claude next to OpenCanvas instead.',
          canSearch: false,
          canBrowseBoards: false,
          canConnect: false,
        };
      if (client.connected)
        return {
          ...base,
          status: 'connected',
          account: client.user,
          detail: 'Search Savee’s public library and browse your boards to add references. Searches count toward Savee’s limit of 200 a week; browsing boards doesn’t.',
          canSearch: true,
          canBrowseBoards: true,
        };
      return {
        ...base,
        status: 'needs-auth',
        detail: 'Connect your Savee account to search its library and add saves from your boards as references. Sign-in happens in your browser; Savee needs a subscription with API access.',
        canSearch: false,
        canBrowseBoards: false,
      };
    },
    search: (query) => client!.search(query),
    boards: () => client!.boards(),
    boardItems: (id) => client!.boardItems(id),
    connect: async () => {
      await client!.connect();
    },
    disconnect: () => client!.disconnect(),
    image: (url) => client!.image(url),
  };
}

let providers: InspirationProvider[] = [saveeProvider(null)];

export function setProviders(list: InspirationProvider[]) {
  providers = list;
}

function find(id: string): InspirationProvider {
  const provider = providers.find((p) => p.info().id === id);
  if (!provider) throw new Error('Unknown inspiration source.');
  return provider;
}

function connected(id: string): InspirationProvider {
  const provider = find(id);
  const info = provider.info();
  if (info.status !== 'connected') throw new Error(`${info.name} isn’t connected. Connect it first.`);
  return provider;
}

export function listProviders(): InspirationProviderInfo[] {
  return providers.map((p) => p.info());
}

export async function searchProvider(id: string, query: string): Promise<InspirationResult[]> {
  const provider = connected(id);
  if (!provider.search) throw new Error(`${provider.info().name} can’t search.`);
  const q = query.trim();
  if (!q) return [];
  return provider.search(q.slice(0, 200));
}

export async function connectProvider(id: string): Promise<InspirationProviderInfo> {
  const provider = find(id);
  if (!provider.connect || !provider.info().canConnect) throw new Error(`${provider.info().name} can’t be connected from OpenCanvas.`);
  await provider.connect();
  return provider.info();
}

export async function disconnectProvider(id: string): Promise<InspirationProviderInfo> {
  const provider = find(id);
  await provider.disconnect?.();
  return provider.info();
}

export async function providerBoards(id: string): Promise<InspirationBoard[]> {
  const provider = connected(id);
  if (!provider.boards) throw new Error(`${provider.info().name} has no boards.`);
  return provider.boards();
}

export async function providerBoardItems(id: string, boardId: string): Promise<InspirationResult[]> {
  const provider = connected(id);
  if (!provider.boardItems) throw new Error(`${provider.info().name} has no boards.`);
  return provider.boardItems(String(boardId).slice(0, 200));
}

export async function providerImage(id: string, url: string): Promise<{ data: Uint8Array; mimeType: string }> {
  const provider = connected(id);
  if (!provider.image) throw new Error(`${provider.info().name} has no images.`);
  return provider.image(String(url));
}
