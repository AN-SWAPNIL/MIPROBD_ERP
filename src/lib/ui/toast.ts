import { create } from "zustand";
import { safeErrorMessage } from "../api/safeErrors";

export type ToastKind = "success" | "error" | "info";

export type ToastMessage = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastState = {
  toasts: ToastMessage[];
  push: (toast: Omit<ToastMessage, "id">) => void;
  remove: (id: string) => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(toast) {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const safeToast = toast.kind === "error" ? { ...toast, title: safeErrorMessage(toast.title), message: toast.message ? safeErrorMessage(toast.message) : undefined } : toast;
    set((state) => ({ toasts: [...state.toasts, { ...safeToast, id }] }));
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
    }, 3600);
  },
  remove(id) {
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  }
}));
