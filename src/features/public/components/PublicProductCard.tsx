import { ArrowRight, MessageSquareText } from "lucide-react";
import { Link } from "react-router-dom";
import type { PublicProduct } from "../public.types";

export default function PublicProductCard({ product }: { product: PublicProduct }) {
  return (
    <article className="flex min-h-[430px] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition hover:border-cyan-300 hover:shadow-md">
      <Link className="grid aspect-[4/3] place-items-center overflow-hidden bg-slate-50 p-5" to={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
        <img className="h-full w-full object-contain transition duration-300 hover:scale-[1.03]" src={product.images[0]} alt={product.imageAlt} />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-bold uppercase text-cyan-700">{product.category}</p>
        <h3 className="mt-2 text-lg font-bold leading-6 text-slate-950">{product.name}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">{product.shortDescription}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm font-bold">
          <Link className="inline-flex items-center gap-1.5 text-blue-900 hover:text-cyan-700" to={`/products/${product.slug}`}>
            View details <ArrowRight className="h-4 w-4" />
          </Link>
          <Link className="inline-flex items-center gap-1.5 text-cyan-700 hover:text-cyan-900" to={`/contact?product=${encodeURIComponent(product.name)}`}>
            <MessageSquareText className="h-4 w-4" /> Contact sales
          </Link>
        </div>
      </div>
    </article>
  );
}
