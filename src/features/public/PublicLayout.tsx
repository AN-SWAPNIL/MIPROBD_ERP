import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PublicFooter from "./PublicFooter";
import PublicHeader from "./PublicHeader";

export default function PublicLayout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="public-site min-h-screen bg-white text-slate-900">
      <PublicHeader />
      <main><Outlet /></main>
      <PublicFooter />
    </div>
  );
}
