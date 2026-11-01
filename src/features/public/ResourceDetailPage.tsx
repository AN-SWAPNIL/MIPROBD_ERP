import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import ContactCTA from "./components/ContactCTA";
import { publicSiteService } from "./publicSiteService";
import type { PublicResource } from "./public.types";
import { usePublicMeta } from "./usePublicMeta";

const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`))
  : "MIPRO resource";

function ResourceMeta({ resource }: { resource: PublicResource }) {
  usePublicMeta({
    title: `${resource.title} | MIPRO Healthcare Corporation`,
    description: resource.summary,
    path: `/news/${resource.slug}`,
    image: resource.image,
    type: "article",
    publishedOn: resource.publishedOn
  });
  return null;
}

export default function ResourceDetailPage() {
  const { slug = "" } = useParams();
  const resource = useQuery({ queryKey: ["public", "resources", slug], queryFn: () => publicSiteService.resource(slug), enabled: Boolean(slug) });
  const related = useQuery({ queryKey: ["public", "resources"], queryFn: publicSiteService.resources });

  if (resource.isLoading) return <div className="grid min-h-[55vh] place-items-center bg-slate-50 text-sm font-semibold text-slate-500">Loading resource...</div>;
  if (resource.isError || !resource.data) return (
    <section className="grid min-h-[60vh] place-items-center bg-slate-50 px-4 py-20 text-center">
      <div><p className="text-xs font-bold uppercase text-cyan-700">Resource unavailable</p><h1 className="mt-3 text-3xl font-bold text-blue-950">This article could not be found.</h1><p className="mt-3 text-slate-600">It may have been unpublished or its address may have changed.</p><Link className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-blue-900 px-4 text-sm font-bold text-white" to="/news"><ArrowLeft className="h-4 w-4" />Back to News & Resources</Link></div>
    </section>
  );

  const item = resource.data;
  const relatedItems = (related.data ?? []).filter((entry) => entry.slug !== item.slug).slice(0, 3);

  return (
    <>
      <ResourceMeta resource={item} />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-4 text-sm sm:px-6 lg:px-8"><Link className="font-semibold text-slate-500 hover:text-blue-900" to="/news">News & Resources</Link><span className="text-slate-300">/</span><span className="truncate font-semibold text-blue-950">{item.title}</span></div>
      </section>

      <header className="border-b border-slate-200 bg-white py-10 sm:py-14">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)] lg:items-center lg:px-8">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase text-cyan-700"><BookOpen className="h-4 w-4" />{item.kind}</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-blue-950 sm:text-5xl">{item.title}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">{item.summary}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-5 text-sm text-slate-500"><span className="font-bold text-blue-950">{item.author || "MIPRO Healthcare Corporation"}</span><span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-cyan-700" />{formatDate(item.publishedOn)}</span><span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-cyan-700" />{item.readingMinutes ?? 3} min read</span></div>
          </div>
          <figure className="min-w-0">
            <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-5"><img className="mx-auto aspect-[4/3] max-h-[520px] w-full object-contain" src={item.image} alt={item.imageAlt ?? item.title} /></div>
            {item.imageAlt ? <figcaption className="mt-3 text-sm leading-6 text-slate-500">{item.imageAlt}</figcaption> : null}
          </figure>
        </div>
      </header>

      <article className="bg-white py-14 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,760px)_280px] lg:justify-between lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3 border-l-4 border-red-600 pl-4"><BookOpen className="h-5 w-5 text-cyan-700" /><div><p className="text-xs font-bold uppercase text-cyan-700">{item.kind}</p><p className="mt-1 text-sm font-semibold text-slate-600">By {item.author || "MIPRO Healthcare Corporation"}</p></div></div>
            <div className="mt-9 space-y-6 text-[17px] leading-8 text-slate-700">
              {item.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>

            {item.takeaways?.length ? <section className="mt-10 border-y border-cyan-200 bg-cyan-50 px-5 py-6 sm:px-7" aria-labelledby="article-takeaways"><h2 className="text-lg font-bold text-blue-950" id="article-takeaways">Key points</h2><ul className="mt-4 grid gap-3">{item.takeaways.map((takeaway) => <li className="flex items-start gap-3 text-sm leading-6 text-slate-700" key={takeaway}><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />{takeaway}</li>)}</ul></section> : null}

            <div className="mt-9 border-l-4 border-amber-400 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"><strong>Professional-use note:</strong> Product and procurement resources do not replace approved instructions for use, institutional procedures or qualified clinical judgment.</div>
          </div>

          <aside className="min-w-0 lg:border-l lg:border-slate-200 lg:pl-7" aria-label="Article information">
            <div className="lg:sticky lg:top-32">
              <p className="text-xs font-bold uppercase text-cyan-700">Published by</p><p className="mt-2 font-bold text-blue-950">{item.author || "MIPRO Healthcare Corporation"}</p><p className="mt-1 text-sm text-slate-500">{formatDate(item.publishedOn)} &middot; {item.readingMinutes ?? 3} min read</p>
              {item.sources?.length ? <div className="mt-8 border-t border-slate-200 pt-6"><h2 className="text-sm font-bold text-blue-950">Sources & further reading</h2><div className="mt-4 grid gap-4">{item.sources.map((source) => <a className="group flex items-start gap-2 text-sm leading-5 text-slate-600 hover:text-blue-900" href={source.url} target={source.url.startsWith("http") ? "_blank" : undefined} rel={source.url.startsWith("http") ? "noreferrer" : undefined} key={source.url}><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" /><span className="group-hover:underline">{source.label}</span></a>)}</div></div> : null}
              <Link className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-blue-900 hover:text-cyan-700" to="/contact">Discuss a product requirement <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </aside>
        </div>
      </article>

      {relatedItems.length ? <section className="border-t border-slate-200 bg-slate-50 py-14 sm:py-16"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase text-cyan-700">Continue reading</p><h2 className="mt-2 text-3xl font-bold text-blue-950">Related resources</h2></div><Link className="hidden items-center gap-2 text-sm font-bold text-blue-900 sm:inline-flex" to="/news">View all <ArrowRight className="h-4 w-4" /></Link></div><div className="mt-8 grid gap-5 md:grid-cols-3">{relatedItems.map((entry) => <Link className="group overflow-hidden rounded-md border border-slate-200 bg-white transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-lg" key={entry.slug} to={`/news/${entry.slug}`}><div className="aspect-[16/9] overflow-hidden bg-white p-3"><img className="h-full w-full object-contain transition duration-500 group-hover:scale-105" src={entry.image} alt={entry.imageAlt ?? ""} /></div><div className="border-t border-slate-100 p-5"><p className="text-xs font-bold uppercase text-cyan-700">{entry.kind}</p><h3 className="mt-2 font-bold leading-6 text-blue-950">{entry.title}</h3><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-blue-900">Read article <ArrowRight className="h-4 w-4" /></span></div></Link>)}</div></div></section> : null}
      <ContactCTA />
    </>
  );
}
