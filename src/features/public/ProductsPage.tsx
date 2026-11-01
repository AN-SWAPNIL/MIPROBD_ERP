import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import PublicPageHero from "./components/PublicPageHero";
import PublicProductCard from "./components/PublicProductCard";
import { publicSiteService } from "./publicSiteService";
import type { PublicProductCategory } from "./public.types";
import { usePublicMeta } from "./usePublicMeta";

export default function ProductsPage() {
  usePublicMeta({
    title: "Medical Products | MIPRO Healthcare Corporation",
    description: "Browse MIPRO's B2B catalogue of hemodialysis, puncture, catheter, airway and protective medical products.",
    path: "/products",
    image: "/medical-products.png"
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const categories = useQuery({ queryKey: ["public", "categories"], queryFn: () => publicSiteService.categories() });
  const categoryValue = searchParams.get("category") ?? "";
  const search = searchParams.get("search") ?? "";
  const validCategory = categories.data?.some((category) => category.name === categoryValue) ? categoryValue as PublicProductCategory : undefined;
  const products = useQuery({
    queryKey: ["public", "products", validCategory ?? "all", search],
    queryFn: () => publicSiteService.products({ category: validCategory, search })
  });

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const countLabel = useMemo(() => `${products.data?.length ?? 0} product${products.data?.length === 1 ? "" : "s"}`, [products.data]);

  return (
    <>
      <PublicPageHero eyebrow="B2B product catalogue" title="Medical devices and consumables" body="Review published product families, then contact MIPRO to confirm the exact model, variant, documentation and quotation requirements." image="/medical-products.png" imageAlt="Collection of hemodialysis and medical consumable products" />
      <section className="bg-slate-50 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
            <label>
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-600"><Search className="h-4 w-4" /> Search products</span>
              <div className="relative">
                <input className="h-11 w-full rounded-md border border-slate-300 px-3 pr-10 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" value={search} onChange={(event) => updateParam("search", event.target.value)} placeholder="Search by product or category" />
                {search ? <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100" type="button" onClick={() => updateParam("search", "")} aria-label="Clear search"><X className="h-4 w-4" /></button> : null}
              </div>
            </label>
            <div>
              <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-600"><SlidersHorizontal className="h-4 w-4" /> Category</span>
              <div className="flex flex-wrap gap-2">
                <button className={validCategory ? "rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" : "rounded-md bg-blue-900 px-3 py-2 text-xs font-bold text-white"} type="button" onClick={() => updateParam("category", "")}>All</button>
                {(categories.data ?? []).map((category) => <button className={validCategory === category.name ? "rounded-md bg-blue-900 px-3 py-2 text-xs font-bold text-white" : "rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"} type="button" key={category.name} onClick={() => updateParam("category", category.name)}>{category.name}</button>)}
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <div><h2 className="text-2xl font-bold text-slate-950">{validCategory ?? "All products"}</h2><p className="mt-1 text-sm text-slate-500">{countLabel}</p></div>
            {validCategory || search ? <button className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white" type="button" onClick={() => setSearchParams({}, { replace: true })}>Clear filters</button> : null}
          </div>

          {(products.data?.length ?? 0) > 0 ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.data?.map((product) => <PublicProductCard key={product.slug} product={product} />)}</div>
          ) : (
            <div className="mt-6 rounded-md border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h3 className="font-bold text-slate-950">No published products match these filters.</h3><p className="mt-2 text-sm text-slate-600">Clear the category or try a broader product name.</p></div>
          )}
        </div>
      </section>
    </>
  );
}
