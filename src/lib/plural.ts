const rules = new Intl.PluralRules('en-US');

export function noun(count: number, one: string, other: string): string {
  return rules.select(count) === 'one' ? one : other;
}

export function plural(count: number, one: string, other: string): string {
  return `${count} ${noun(count, one, other)}`;
}
