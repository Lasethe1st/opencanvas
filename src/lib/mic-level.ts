import { useEffect, useRef } from "react";

/**
 * Live microphone loudness (0–1) while `active`, pushed to `onLevel` about every animation frame.
 * It opens its own stream just for metering, so it works alongside whichever transcriber is listening.
 * Failing quietly (no mic, permission denied) leaves the level at 0.
 */
export function useMicLevel(active: boolean, onLevel: (level: number) => void) {
  const cb = useRef(onLevel);
  cb.current = onLevel;
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          // Speech RMS sits around 0.02–0.3; stretch it so normal talking fills most of the range.
          cb.current(Math.min(1, Math.sqrt(sum / buf.length) * 4.5));
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
    };
  }, [active]);
}
