import clsx from "clsx";
import { X } from "lucide-react";
import { useToastStore } from "../../lib/ui/toast";

const tone = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-blue-200 bg-blue-50 text-blue-800"
};

export default function Toasts() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="no-print fixed right-4 top-4 z-[70] grid w-[min(92vw,360px)] gap-2">
      {toasts.map((toast) => (
        <div className={clsx("rounded-lg border p-3 shadow-lg", tone[toast.kind])} key={toast.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <strong className="block text-sm">{toast.title}</strong>
              {toast.message ? <p className="mt-1 text-sm opacity-80">{toast.message}</p> : null}
            </div>
            <button type="button" onClick={() => remove(toast.id)} aria-label="Dismiss toast">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
