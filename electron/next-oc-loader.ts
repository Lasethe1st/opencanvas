/** Webpack loader the Next.js preview adds in memory: plain `data-oc-id` attributes, so Server Components work too. */
import { transformForNext } from './next-config';

export default function openCanvasLoader(this: { resourcePath: string; getOptions(): { projectRoot: string } }, code: string): string {
  return transformForNext(code, this.resourcePath, this.getOptions().projectRoot);
}
