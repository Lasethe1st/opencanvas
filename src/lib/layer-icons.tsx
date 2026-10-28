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
} from '@phosphor-icons/react';

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

/** The icon and colour that say what kind of element a layer is. Unknown tags (components) get a cube. */
export function LayerIcon({ tag, size = 14, className }: { tag: string; size?: number; className?: string }) {
  const [IconCmp, kind] = BY_TAG[tag.toLowerCase()] ?? [tag === tag.toLowerCase() ? Square : Cube, 'struct' as Kind];
  return <IconCmp size={size} weight="fill" className={className} style={{ color: KIND_COLOR[kind] }} aria-hidden="true" />;
}
