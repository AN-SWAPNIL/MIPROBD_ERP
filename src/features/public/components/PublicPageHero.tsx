import type { ReactNode } from "react";

type PublicPageHeroProps = {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  actions?: ReactNode;
};

export default function PublicPageHero({ eyebrow, title, body, image, imageAlt, actions }: PublicPageHeroProps) {
  return (
    <section className="relative min-h-[390px] overflow-hidden bg-blue-950 text-white sm:min-h-[430px]">
      <img className="absolute inset-0 h-full w-full object-cover" src={image} alt={imageAlt} />
      <div className="absolute inset-0 bg-blue-950/82" />
      <div className="relative mx-auto flex min-h-[390px] max-w-7xl items-center px-4 py-16 sm:min-h-[430px] sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase text-cyan-300">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">{body}</p>
          {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
