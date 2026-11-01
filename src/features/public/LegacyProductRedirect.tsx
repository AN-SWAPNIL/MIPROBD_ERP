import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
import { publicSiteService } from "./publicSiteService";

export default function LegacyProductRedirect() {
  const { legacySlug = "" } = useParams();
  const product = useQuery({ queryKey: ["public", "legacy-product", legacySlug], queryFn: () => publicSiteService.legacyProduct(legacySlug) });
  if (product.isLoading) return <div className="grid min-h-screen place-items-center text-sm font-semibold text-slate-500">Resolving product page...</div>;
  return <Navigate to={product.data ? `/products/${product.data.slug}` : "/products"} replace />;
}
