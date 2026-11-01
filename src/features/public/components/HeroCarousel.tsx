import clsx from "clsx";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PublicHeroSlide } from "../public.types";

export default function HeroCarousel({ slides }: { slides: PublicHeroSlide[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [active, slides.length]);

  if (!slides.length) {
    return <section className="grid min-h-[540px] place-items-center bg-blue-950 px-4 text-center text-white"><div><p className="text-sm font-bold uppercase text-cyan-300">MIPRO Healthcare Corporation</p><h1 className="mt-3 text-4xl font-bold">Precision in Healthcare</h1></div></section>;
  }

  const go = (direction: number) => setActive((value) => (value + direction + slides.length) % slides.length);

  return (
    <section className="relative h-[min(680px,calc(100svh-120px))] min-h-[540px] overflow-hidden bg-blue-950 text-white" aria-roledescription="carousel" aria-label="MIPRO highlights">
      {slides.map((slide, index) => {
        const Heading = active === index ? "h1" : "div";
        return (
        <article
          aria-hidden={active !== index}
          aria-label={`${index + 1} of ${slides.length}`}
          className={clsx("absolute inset-0 transition-opacity duration-700", active === index ? "z-10 opacity-100" : "pointer-events-none opacity-0")}
          key={slide.id}
        >
          <img className="absolute inset-0 h-full w-full object-cover" src={slide.image} alt={slide.imageAlt} fetchPriority={index === 0 ? "high" : "auto"} />
          <div className="absolute inset-0 bg-blue-950/76" />
          <div className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(8,29,66,0.96)_0%,rgba(8,29,66,0.76)_52%,rgba(8,29,66,0.18)_100%)]" />
          <div className="relative mx-auto flex h-full max-w-7xl items-center px-4 pb-20 pt-12 sm:px-6 lg:px-8">
            <div className={clsx("max-w-3xl transition duration-700", active === index ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0")}>
              <p className="text-xs font-bold uppercase tracking-normal text-cyan-300 sm:text-sm">{slide.eyebrow}</p>
              <Heading className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">{slide.title}</Heading>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg sm:leading-8">{slide.body}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="inline-flex h-12 items-center gap-2 rounded-md bg-cyan-400 px-5 text-sm font-bold text-blue-950 hover:bg-cyan-300" to={slide.primaryHref}>{slide.primaryLabel} <ArrowRight className="h-4 w-4" /></Link>
                {slide.secondaryHref && slide.secondaryLabel ? <Link className="inline-flex h-12 items-center rounded-md border border-white/40 px-5 text-sm font-bold text-white hover:bg-white/10" to={slide.secondaryHref}>{slide.secondaryLabel}</Link> : null}
              </div>
            </div>
          </div>
        </article>
        );
      })}

      <div className="absolute bottom-5 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-7xl -translate-x-1/2 items-center justify-between gap-4 px-0 sm:px-2">
        <div className="flex items-center gap-2" role="tablist" aria-label="Select homepage highlight">
          {slides.map((slide, index) => <button className={clsx("h-1.5 rounded-full transition-all", active === index ? "w-10 bg-cyan-300" : "w-5 bg-white/40 hover:bg-white/70")} type="button" key={slide.id} onClick={() => setActive(index)} aria-label={`Show ${slide.title}`} aria-selected={active === index} role="tab" />)}
        </div>
        {slides.length > 1 ? <div className="flex items-center gap-1">
          <button className="grid h-10 w-10 place-items-center rounded-md border border-white/30 bg-blue-950/40 text-white hover:bg-white/10" type="button" onClick={() => go(-1)} aria-label="Previous highlight"><ChevronLeft className="h-5 w-5" /></button>
          <button className="grid h-10 w-10 place-items-center rounded-md border border-white/30 bg-blue-950/40 text-white hover:bg-white/10" type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Play highlights" : "Pause highlights"}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
          <button className="grid h-10 w-10 place-items-center rounded-md border border-white/30 bg-blue-950/40 text-white hover:bg-white/10" type="button" onClick={() => go(1)} aria-label="Next highlight"><ChevronRight className="h-5 w-5" /></button>
        </div> : null}
      </div>
    </section>
  );
}
