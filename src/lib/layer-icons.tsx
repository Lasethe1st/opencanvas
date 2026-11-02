import {
  Cube,
  CursorClick,
  Compass,
  Image as ImageIcon,
  Link as LinkIcon,
  ListBullets,
  Layout,
  Rectangle,
  Shapes,
  Square,
  SquaresFour,
  Table,
  TextAa,
  TextT,
  Textbox,
  VideoCamera,
  type Icon,
} from './hugeicons';

type Kind = 'text' | 'media' | 'action' | 'form' | 'struct';

const KIND_COLOR: Record<Kind, string> = {
  text: 'var(--layer-text)',
  media: 'var(--layer-media)',
  action: 'var(--layer-action)',
  form: 'var(--layer-form)',
  struct: 'var(--layer-struct)',
};

const BY_TAG: Record<string, [Icon, Kind]> = {
  h1: [TextT, 'text'], h2: [TextT, 'text'], h3: [TextT, 'text'], h4: [TextT, 'text'], h5: [TextT, 'text'], h6: [TextT, 'text'],
  p: [TextAa, 'text'], span: [TextAa, 'text'], label: [TextAa, 'text'], strong: [TextAa, 'text'], em: [TextAa, 'text'], small: [TextAa, 'text'], blockquote: [TextAa, 'text'],
  img: [ImageIcon, 'media'], picture: [ImageIcon, 'media'], figure: [ImageIcon, 'media'], video: [VideoCamera, 'media'], svg: [Shapes, 'media'], canvas: [Shapes, 'media'],
  button: [Rectangle, 'action'], a: [LinkIcon, 'action'], summary: [CursorClick, 'action'],
  input: [Textbox, 'form'], textarea: [Textbox, 'form'], select: [Textbox, 'form'], form: [Textbox, 'form'], fieldset: [Textbox, 'form'],
  nav: [Compass, 'struct'], ul: [ListBullets, 'struct'], ol: [ListBullets, 'struct'], li: [ListBullets, 'struct'], table: [Table, 'struct'],
  section: [Layout, 'struct'], main: [Layout, 'struct'], header: [Layout, 'struct'], footer: [Layout, 'struct'], article: [Layout, 'struct'], aside: [Layout, 'struct'],
  div: [SquaresFour, 'struct'],
};

export type LayerKind = Kind;

function lookup(tag: string): [Icon, Kind] {
  return BY_TAG[tag.toLowerCase()] ?? [tag === tag.toLowerCase() ? Square : Cube, 'struct'];
}

/** Which colour family a tag belongs to (text, media, action, form or struct). */
export function layerKind(tag: string): Kind {
  return lookup(tag)[1];
}

/** The icon and colour that say what kind of element a layer is. Unknown tags (components) get a cube.
 *  Pass `color` to override the kind colour, e.g. `currentColor` inside a tinted chip. */
export function LayerIcon({ tag, size = 14, className, color }: { tag: string; size?: number; className?: string; color?: string }) {
  const [IconCmp, kind] = lookup(tag);
  return <IconCmp size={size} weight="fill" className={className} style={{ color: color ?? KIND_COLOR[kind] }} aria-hidden="true" />;
}
