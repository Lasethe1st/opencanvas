/** Inspiration providers: sources of real design references. Credentials never leave the main process. */

export type InspirationStatus = 'connected' | 'needs-auth' | 'unavailable';

export interface InspirationProviderInfo {
  id: string;
  name: string;
  status: InspirationStatus;
  /** What the provider can do once connected, or why it can't be used yet. */
  detail: string;
  /** Where to learn more or set it up. */
  docsUrl: string | null;
  /** An alternative that works today, such as connecting the provider to your AI agent. */
  workaround: string | null;
  canSearch: boolean;
  canBrowseBoards: boolean;
  /** Can be connected from OpenCanvas (a browser sign-in). */
  canConnect?: boolean;
  /** The account it's connected as. */
  account?: string | null;
}

export interface InspirationResult {
  id: string;
  title: string;
  /** Page on the provider. */
  url: string;
  /** Original source of the work, when the provider reports it. */
  sourceUrl: string | null;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  colors: string[];
  tags: string[];
}

export interface InspirationBoard {
  id: string;
  name: string;
  count: number;
}

export interface InspirationProvider {
  info(): InspirationProviderInfo;
  search?(query: string): Promise<InspirationResult[]>;
  boards?(): Promise<InspirationBoard[]>;
  boardItems?(boardId: string): Promise<InspirationResult[]>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  /** Downloads an image from one of its own results. */
  image?(url: string): Promise<{ data: Uint8Array; mimeType: string }>;
}
