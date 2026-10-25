import { Shapeshift } from './shapeshift';
import { shapes } from './shapeshift-shapes';

/** Bottom-center Shapeshift bar on the canvas stage. */
export function CanvasShapeshift() {
  return (
    <div className="canvas-shapeshift" data-tw="" onPointerDown={(e) => e.stopPropagation()}>
      <Shapeshift
        shapes={shapes}
        hotkey={false}
        width={540}
        label="Type anything"
        classNames={{
          shell: 'shadow-none',
          list: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          panel: '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        }}
      />
    </div>
  );
}
