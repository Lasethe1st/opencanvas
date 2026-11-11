import { useSyncExternalStore } from 'react';
import {
  Add01Icon, BookOpen01Icon, Briefcase01Icon, Calendar03Icon, Camera01Icon, ChartLineData01Icon, CreditCardIcon, CustomerSupportIcon,
  FavouriteIcon, File02Icon, GiftIcon, GlobeIcon, HelpCircleIcon, Home04Icon, Image01Icon, InformationCircleIcon, Location01Icon,
  Mail01Icon, Megaphone01Icon, MessageMultiple01Icon, MusicNote01Icon, NewsIcon, Notification01Icon, PlayIcon, Rocket01Icon,
  Search01Icon, Settings01Icon, Shield01Icon, ShoppingCart01Icon, StarIcon, TagsIcon, UserIcon,
} from '@hugeicons/core-free-icons';

/** The icons a page can wear, by stable name. Pages without a choice get the file icon (the home page gets a house). */
export const PAGE_ICONS = {
  file: File02Icon, home: Home04Icon, user: UserIcon, mail: Mail01Icon, cart: ShoppingCart01Icon, settings: Settings01Icon,
  calendar: Calendar03Icon, image: Image01Icon, book: BookOpen01Icon, chart: ChartLineData01Icon, heart: FavouriteIcon, star: StarIcon,
  bell: Notification01Icon, search: Search01Icon, location: Location01Icon, card: CreditCardIcon, chat: MessageMultiple01Icon,
  help: HelpCircleIcon, info: InformationCircleIcon, rocket: Rocket01Icon, camera: Camera01Icon, music: MusicNote01Icon, play: PlayIcon,
  work: Briefcase01Icon, globe: GlobeIcon, shield: Shield01Icon, megaphone: Megaphone01Icon, news: NewsIcon, support: CustomerSupportIcon,
  tags: TagsIcon, gift: GiftIcon, plus: Add01Icon,
} as const;
export type PageIconName = keyof typeof PAGE_ICONS;

const KEY = 'oc.page.icons';
type Saved = Record<string, PageIconName>;
const listeners = new Set<() => void>();
let cache: Saved | null = null;

function read(): Saved {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
    cache = Object.fromEntries(Object.entries(raw).filter(([, v]) => v in PAGE_ICONS)) as Saved;
  } catch {
    cache = {};
  }
  return cache;
}

const keyOf = (root: string | undefined, pageId: string) => `${root ?? ''}:${pageId}`;

export function setPageIcon(root: string | undefined, pageId: string, name: PageIconName | null) {
  const next = { ...read() };
  if (name) next[keyOf(root, pageId)] = name;
  else delete next[keyOf(root, pageId)];
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private window: the choice lasts for this session only */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The chosen icon for a page, or its default. */
export function usePageIcon(root: string | undefined, pageId: string, path?: string) {
  const saved = useSyncExternalStore(subscribe, read, () => ({}) as Saved);
  const name = saved[keyOf(root, pageId)];
  return { name: name ?? null, icon: PAGE_ICONS[name ?? (path === '/' ? 'home' : 'file')] };
}

/** Extra words a person might type to find an icon. */
export const PAGE_ICON_WORDS: Record<PageIconName, string> = {
  file: 'document page text', home: 'house landing start', user: 'profile account person about team', mail: 'email contact message inbox',
  cart: 'shop store checkout buy', settings: 'gear preferences config', calendar: 'date events schedule booking', image: 'photo gallery picture',
  book: 'docs guide blog read', chart: 'analytics stats dashboard graph', heart: 'favorite like love', star: 'rating featured review',
  bell: 'notifications alerts', search: 'find explore', location: 'map pin place address', card: 'payment billing pricing',
  chat: 'messages comments support talk', help: 'faq question', info: 'about details', rocket: 'launch start product',
  camera: 'photo portfolio', music: 'audio sound', play: 'video media watch', work: 'jobs careers business portfolio',
  globe: 'world web language international', shield: 'security privacy legal terms', megaphone: 'announcement marketing promo',
  news: 'blog press articles updates', support: 'help contact service', tags: 'categories labels pricing', gift: 'offers rewards promo', plus: 'add new',
};
