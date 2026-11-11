const NAMES: Record<string, string> = {
  div: 'Container', section: 'Section', header: 'Header', footer: 'Footer', nav: 'Navigation', main: 'Main content',
  article: 'Article', aside: 'Sidebar', p: 'Paragraph', span: 'Text', blockquote: 'Quote', small: 'Small text',
  strong: 'Bold text', em: 'Italic text', label: 'Label', a: 'Link', button: 'Button', img: 'Image', picture: 'Image',
  video: 'Video', audio: 'Audio', ul: 'List', ol: 'Numbered list', li: 'List item', form: 'Form', input: 'Input',
  textarea: 'Text area', select: 'Dropdown', table: 'Table', svg: 'Graphic', hr: 'Divider', figure: 'Figure',
  h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
};

/** A plain-language name for an HTML tag, for people who don't think in tags. Unknown tags come back as typed. */
export function friendlyTag(tag: string): string {
  return NAMES[tag.toLowerCase()] ?? tag;
}
