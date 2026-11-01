import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CalendarDays, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import PublicPageHero from "./components/PublicPageHero";
import SectionHeading from "./components/SectionHeading";
import { publicSiteService } from "./publicSiteService";
import { usePublicMeta } from "./usePublicMeta";

const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`))
  : "MIPRO resource";

export default function NewsPage() {
  usePublicMeta({
    title: "Healthcare News & Resources | MIPRO Healthcare Corporation",
    description: "Read curated MIPRO product guides and healthcare procurement resources for institutional medical supply review.",
    path: "/news",
    image: "/products/blood-tubing-set.png"
  });
  const resources = useQuery({ queryKey: ["public", "resources"], queryFn: () => publicSiteService.resources() });
  const rows = resources.data ?? [];

  return (
    <>
      <PublicPageHero eyebrow="News & resources" title="Relevant guidance for healthcare procurement" body="Curated product education, documentation guidance and MIPRO updates, without unrelated news or generic store content." image="/products/blood-tubing-set.png" imageAlt="Hemodialysis blood tubing set" />
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Resource library" title="Practical, product-focused information" body="These short resources support inquiry preparation. They do not replace approved product instructions or clinical judgment." />
          {resources.isLoading ? <div className="mt-9 border-y border-slate-200 py-12 text-center text-sm font-semibold text-slate-500">Loading published resources...</div> : null}
          <div className="mt-9 grid gap-5">
            {rows.map((resource) => (
              <Link className="group grid min-w-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition hover:border-cyan-300 hover:shadow-lg sm:grid-cols-[minmax(0,1fr)_220px] lg:grid-cols-[minmax(0,1fr)_280px]" key={resource.slug} to={`/news/${resource.slug}`}>
                <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6 lg:p-8">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"><span className="inline-flex items-center gap-1.5 font-bold uppercase text-cyan-700"><BookOpen className="h-4 w-4" />{resource.kind}</span><span className="inline-flex items-center gap-1.5 text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{formatDate(resource.publishedOn)}</span><span className="inline-flex items-center gap-1 text-slate-400"><Clock3 className="h-3.5 w-3.5" />{resource.readingMinutes ?? 3} min read</span></div>
                  <h2 className="mt-3 text-xl font-bold leading-7 text-blue-950 sm:text-2xl">{resource.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{resource.summary}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-900">Read full article <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                </div>
                <div className="grid min-h-52 place-items-center overflow-hidden border-t border-slate-200 bg-white p-5 sm:min-h-56 sm:border-l sm:border-t-0"><img className="h-full max-h-60 w-full object-contain transition duration-500 group-hover:scale-[1.04]" src={resource.image} alt={resource.imageAlt ?? ""} /></div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
