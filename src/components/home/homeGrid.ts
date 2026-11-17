import { useExperienceLevel } from '@/lib/experience';

/**
 * Home layout for normal and veteran levels: a 12-column row.
 * Navigation 2, chat 8, browser (sources) 2. Class names are written out in full so Tailwind sees them.
 * To change the split, edit the three span groups below; they must add up to 12.
 * Narrow windows fall back to nav 3 / chat 9, then chat only (container queries on the home root).
 */
export const HOME_GRID = {
  root: '@container/home grid h-full grid-cols-12',
  nav: 'col-span-3 hidden @2xl/home:block @6xl/home:col-span-2',
  chat: 'col-span-12 @2xl/home:col-span-9 @6xl/home:col-span-8',
  browser: 'col-span-2 hidden @6xl/home:block',
} as const;

/** Easy mode keeps the sliding-card home; the other two levels use the grid. */
export function useHomeGrid() {
  return useExperienceLevel() !== 'beginner';
}
