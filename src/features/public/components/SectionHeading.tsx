type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
  tone?: "light" | "dark";
};

export default function SectionHeading({ eyebrow, title, body, align = "left", tone = "light" }: SectionHeadingProps) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {eyebrow ? <p className={tone === "dark" ? "text-xs font-bold uppercase text-cyan-300" : "text-xs font-bold uppercase text-cyan-700"}>{eyebrow}</p> : null}
      <h2 className={tone === "dark" ? "mt-2 text-3xl font-bold leading-tight text-white sm:text-4xl" : "mt-2 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl"}>{title}</h2>
      {body ? <p className={tone === "dark" ? "mt-4 text-base leading-7 text-slate-300" : "mt-4 text-base leading-7 text-slate-600"}>{body}</p> : null}
    </div>
  );
}
