const LAYERS = 6;

/**
 * A progressive blur along the top of the home pane: content scrolling up under the header softens a little more
 * the closer it gets to the edge, then fades into the pane colour. It sits above the scroller and below the header
 * buttons, and lets every click through.
 *
 * A single backdrop-filter would switch on at a hard line, so the blur is built from stacked layers: each is twice
 * as blurry as the last and masked to a smaller strip at the top.
 */
export function HomeTopBlur({ height = 88 }: { height?: number }) {
  return (
    <div aria-hidden data-home-top-blur="" className="pointer-events-none absolute inset-x-0 top-0 z-10" style={{ height }}>
      {Array.from({ length: LAYERS }, (_, i) => {
        const solid = Math.max(0, 80 - i * 14);
        const mask = `linear-gradient(to bottom, #000 0%, #000 ${solid}%, transparent ${solid + 22}%)`;
        const blur = `blur(${0.5 * 2 ** i}px)`;
        return <div key={i} className="absolute inset-0" style={{ backdropFilter: blur, WebkitBackdropFilter: blur, maskImage: mask, WebkitMaskImage: mask }} />;
      })}
      <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_srgb,var(--home-card)_70%,transparent)] to-transparent" />
    </div>
  );
}
