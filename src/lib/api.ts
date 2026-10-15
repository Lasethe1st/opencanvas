import type { OpenCanvasApi } from '../../shared/api';
import { createBrowserApi } from './browser-api';

declare global {
  interface Window {
    oc: OpenCanvasApi;
  }
}

export const isBrowserPreview = !window.oc;

export const api: OpenCanvasApi = window.oc ?? createBrowserApi();
