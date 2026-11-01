import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { demoMode, foundationMode } from "../../lib/runtime";
import { apiClient } from "../../lib/api/client";
import AuthShell from "./AuthShell";

export default function ResetPasswordPage() {
  const resetPassword = useAuthStore((store) => store.resetPassword);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const started = useRef(false);
  const { register, handleSubmit } = useForm<{ email: string; password: string }>({
    defaultValues: { email: demoMode ? "accounts@mipro.local" : "", password: "" }
  });

  useEffect(() => {
    if (!foundationMode || started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!access || !refresh) { setError("Open the invitation or password recovery link from your email."); return; }
    setBusy(true);
    void apiClient.exchangeRecovery(access, refresh).then((response) => setRecoveryToken(response.data.token)).catch(() => setError("This link is invalid or expired. Request a new recovery link.")).finally(() => setBusy(false));
  }, []);

  return (
    <AuthShell title="Reset password" subtitle="Choose a new password for an assigned ERP account.">
      {done ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
          <strong>Password updated.</strong>
          <Link className="mt-4 block font-bold underline" to="/login">
            Return to login
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={handleSubmit(async (values) => {
            setBusy(true);
            setError("");
            try {
              if (foundationMode) await apiClient.resetPassword("", values.password, recoveryToken);
              else await resetPassword(values.email, values.password);
              setRecoveryToken("");
              setDone(true);
            } catch (error) { setError(error instanceof Error ? error.message : "Password update failed."); }
            finally { setBusy(false); }
          })}
        >
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          {!foundationMode ? <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Email</span>
            <input className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" {...register("email")} />
          </label> : null}
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">New Password</span>
            <input className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" type="password" autoComplete="new-password" minLength={foundationMode ? 12 : 6} required {...register("password")} />
          </label>
          <Button type="submit" variant="primary" disabled={busy || (foundationMode && !recoveryToken)} icon={<KeyRound className="h-4 w-4" />}>
            Save New Password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
