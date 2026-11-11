/** Device sizes offered when adding a frame (CSS pixels, portrait for phones and tablets). */
export type DeviceKind = 'desktop' | 'phone' | 'tablet' | 'console';
export type DevicePreset = { id: string; label: string; width: number; height: number; kind: DeviceKind };

export const DEVICE_GROUPS: { kind: DeviceKind; title: string }[] = [
  { kind: 'desktop', title: 'Desktop' },
  { kind: 'phone', title: 'Phone' },
  { kind: 'tablet', title: 'Tablet' },
  { kind: 'console', title: 'Game console' },
];

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'mbp16', label: 'MacBook Pro 16″', width: 1728, height: 1117, kind: 'desktop' },
  { id: 'mbp14', label: 'MacBook Pro 14″', width: 1512, height: 982, kind: 'desktop' },
  { id: 'mba13', label: 'MacBook Air 13″', width: 1470, height: 956, kind: 'desktop' },
  { id: 'imac24', label: 'iMac 24″', width: 2240, height: 1260, kind: 'desktop' },
  { id: 'win-fhd', label: 'Windows 1920 × 1080', width: 1920, height: 1080, kind: 'desktop' },
  { id: 'win-laptop', label: 'Windows laptop', width: 1366, height: 768, kind: 'desktop' },
  { id: 'iphone16', label: 'iPhone 16', width: 393, height: 852, kind: 'phone' },
  { id: 'iphone16max', label: 'iPhone 16 Pro Max', width: 440, height: 956, kind: 'phone' },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, kind: 'phone' },
  { id: 'pixel9', label: 'Google Pixel 9', width: 412, height: 915, kind: 'phone' },
  { id: 's24', label: 'Galaxy S24', width: 360, height: 780, kind: 'phone' },
  { id: 'ipad-pro11', label: 'iPad Pro 11″', width: 834, height: 1194, kind: 'tablet' },
  { id: 'ipad-mini', label: 'iPad mini', width: 744, height: 1133, kind: 'tablet' },
  { id: 'steam-deck', label: 'Steam Deck', width: 1280, height: 800, kind: 'console' },
  { id: 'switch', label: 'Nintendo Switch', width: 1280, height: 720, kind: 'console' },
  { id: 'tv', label: 'PlayStation / Xbox (TV)', width: 1920, height: 1080, kind: 'console' },
];
