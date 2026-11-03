Components in this folder are vendored from **Amicro** (MIT) — https://github.com/Subhan-code/Amicro--Micro-transitions- / https://amicro.vercel.app
Pulled from its shadcn registry (`registry/ui/*.json`), imports switched from `framer-motion` to `motion/react` (same API), and restyled to the Outfit Maker palette.
- magnetic-button.tsx  (hover/magnetic-button)
- tilt-card.tsx        (hover/tilt-card)
- fade-up.tsx          (entrance/fade-up)
- text-reveal.tsx      (text/text-reveal)
- bounce-dots.tsx      (loading/bounce-dots)
- shimmer-line.tsx     (loading/shimmer-line)
- classic-toggle.tsx   (toggles/classic-toggle, made controlled)
- prompt-chips.tsx     (ai/ai-prompt-chips, adapted into a selectable chip group)

**Perf pass (2026-11-04):** to keep phones at 60 fps, every component here except the app shell's motion usage was
re-implemented without the motion runtime: entrances/loaders are CSS keyframes on transform/opacity
(`om-fade-up`, `om-reveal`, `om-bounce`, `om-shimmer` in `globals.css`), tilt and magnetic pull are rAF-throttled
transforms that only switch on for a mouse (`(hover: hover) and (pointer: fine)`), presses are CSS `:active`
scales with a spring curve. Same props/API as before. App pages use `m` components under `LazyMotion` (AppShell).
