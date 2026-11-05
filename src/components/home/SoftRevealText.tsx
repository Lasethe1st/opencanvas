import type { CSSProperties } from 'react';
import styles from './SoftRevealText.module.css';

/** Word-ish tokens for staggered reveal. */
function tokensOf(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? (text ? [text] : []);
}

/** Cap so long replies don't spend seconds cascading in. */
const MAX_STAGGER = 28;

/**
 * Full reply reveal: words fade/rise in at staggered times after the hold.
 * Used once when a streamed answer is ready — not while tokens are still arriving.
 */
export function SoftRevealText({ text }: { text: string }) {
  const tokens = tokensOf(text);
  let wordIndex = 0;

  return (
    <>
      {tokens.map((tok, i) => {
        if (!/\S/.test(tok)) return <span key={i}>{tok}</span>;
        const iWord = Math.min(wordIndex++, MAX_STAGGER);
        return (
          <span key={i} className={styles.word} style={{ '--i': iWord } as CSSProperties}>
            {tok}
          </span>
        );
      })}
    </>
  );
}
