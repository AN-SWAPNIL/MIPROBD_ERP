import {
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Landmark,
  PackageSearch,
  Search,
  ShoppingCart,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import { useAuthStore } from "../../lib/auth/session";
import { foundationMode, workspacePath } from "../../lib/runtime";
import { reportService } from "../services";
import { ErrorBlock, LoadingBlock } from "../components";
import { reportCategories, visibleReportCatalog, type ReportCategoryId } from "./reportCatalog";

const categoryIcons = {
  sales: ShoppingCart,
  customers: Users,
  suppliers: BriefcaseBusiness,
  inventory: Boxes,
  accounts: Landmark,
  employees: BarChart3,
  controls: ClipboardCheck
} satisfies Record<ReportCategoryId, typeof FileSearch>;

function legacyReport(params: URLSearchParams) {
  const report = params.get("report") || params.get("table");
  if (report) return report === "audit-events" ? "audit-trail" : report;
  if (params.get("view") === "audit") return "audit-trail";
  if (params.get("view") === "marketing") return "daily-marketing";
  return "";
}

export default function ReportsPage() {
  const user = useAuthStore((state) => state.session?.user);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const savedCatalogue = useQuery({ queryKey: ["reports", "catalogue"], queryFn: reportService.catalogue, enabled: foundationMode });
  const catalog = useMemo(() => foundationMode ? savedCatalogue.data ?? [] : visibleReportCatalog(user), [user, savedCatalogue.data]);
  const normalizedSearch = search.trim().toLowerCase();
  const visible = normalizedSearch ? catalog.filter((report) => [report.title, report.description, report.category, ...report.keywords].join(" ").toLowerCase().includes(normalizedSearch)) : catalog;

  useEffect(() => {
    const reportId = legacyReport(params);
    if (!reportId || !catalog.some((report) => report.id === reportId)) return;
    const next = new URLSearchParams(params);
    next.delete("view");
    next.delete("category");
    next.delete("report");
    next.delete("table");
    navigate({ pathname: workspacePath(`/app/reports/${reportId}`), search: next.toString() ? `?${next}` : "" }, { replace: true });
  }, [catalog, navigate, params]);

  const openReport = (reportId: string) => navigate(workspacePath(`/app/reports/${reportId}`));
  if (foundationMode && savedCatalogue.isLoading) return <LoadingBlock label="Loading authorized reports" />;
  if (foundationMode && savedCatalogue.isError) return <ErrorBlock error={savedCatalogue.error} />;

  return (
    <div className="grid gap-5" data-testid="report-catalogue">
      <PageHeader
        eyebrow="Business intelligence"
        title="Reports"
        subtitle="Choose a report, set only the filters it needs, then review, export or open the official print preview."
      />

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative block max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports by name or business area..."
            aria-label="Search reports"
          />
        </label>
      </section>

      {reportCategories.map((category) => {
        const reports = visible.filter((report) => report.category === category.id);
        if (!reports.length) return null;
        const Icon = categoryIcons[category.id];
        return (
          <section className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm" key={category.id}>
            <header className="flex items-center gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-3 sm:px-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-blue-950 text-cyan-300"><Icon className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="font-bold text-blue-950">{category.title}</h2>
                <p className="text-xs text-slate-500">{category.description}</p>
              </div>
              <span className="ml-auto rounded bg-white px-2 py-1 text-xs font-bold text-slate-500">{reports.length}</span>
            </header>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {reports.map((report) => (
                <button
                  className="group flex min-h-32 flex-col border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-400 hover:bg-cyan-50/40 hover:shadow-sm"
                  type="button"
                  disabled={"available" in report && !report.available}
                  onClick={() => openReport(report.id)}
                  key={report.id}
                >
                  <span className="mb-4 grid h-9 w-9 place-items-center rounded bg-slate-100 text-cyan-800 transition group-hover:bg-blue-950 group-hover:text-cyan-300">
                    <PackageSearch className="h-4 w-4" />
                  </span>
                  <strong className="text-sm text-blue-950">{report.title}</strong>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{report.description}</span>
                  <span className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-bold text-cyan-800">
                    {"available" in report && !report.available ? "Source migration pending" : "View report"} <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                  {"pendingReason" in report && report.pendingReason ? <span className="mt-2 text-xs font-normal leading-5 text-amber-800">{report.pendingReason}</span> : null}
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {!visible.length ? (
        <section className="rounded-md border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 font-bold text-blue-950">No matching report</h2>
          <p className="mt-1 text-sm text-slate-500">Try a report name, customer, supplier, stock or employee keyword.</p>
        </section>
      ) : null}
    </div>
  );
}
