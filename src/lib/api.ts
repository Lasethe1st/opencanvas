import type { OpenCanvasApi } from '../../shared/api';

declare global {
  interface Window {
    oc: OpenCanvasApi;
  }
}

export const api: OpenCanvasApi = window.oc;
