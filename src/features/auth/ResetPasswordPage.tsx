import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { demoMode, foundationMode } from "../../lib/runtime";
import { ApiRequestError, apiClient } from "../../lib/api/client";
import { saveSession } from "../../lib/auth/transport";
import AuthShell from "./AuthShell";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const resetPassword = useAuthStore((store) => store.resetPassword);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState("");
  const [needsAuthenticator, setNeedsAuthenticator] = useState(false);
  const [factors, setFactors] = useState<{ id: string; name: string }[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const started = useRef(false);
  const { register, handleSubmit } = useForm<{ email: string; password: string }>({
    defaultValues: { email: demoMode ? "accounts@mipro.local" : "", password: "" }
  });

  async function loadFactors(token: string) {
    const status = await apiClient.recoveryFactors(token);
    const verified = status.factors.filter((factor) => factor.status === "verified");
    setFactors(verified);
    setFactorId(verified[0]?.id ?? "");
  }

  useEffect(() => {
    if (!foundationMode || started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!access || !refresh) { setError("Open the invitation or password recovery link from your email."); return; }
    setBusy(true);
    void apiClient.exchangeRecovery(access, refresh).then(async (response) => {
      setRecoveryToken(response.data.token);
      if (response.data.security?.enrolled && response.data.security.assurance !== "aal2") {
        setNeedsAuthenticator(true);
        await loadFactors(response.data.token);
      }
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "This link is invalid or expired. Request a new recovery link.");
      if (cause instanceof ApiRequestError && cause.status === 401) { setRecoveryToken(""); setNeedsAuthenticator(false); }
    }).finally(() => setBusy(false));
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
      ) : needsAuthenticator ? (
        <form className="grid gap-4" onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setError("");
          try {
            const response = await apiClient.verifyRecoveryFactor(recoveryToken, factorId, code);
            setRecoveryToken(response.data.token); setCode(""); setNeedsAuthenticator(false);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Authenticator verification failed.");
            if (cause instanceof ApiRequestError && cause.status === 401) { setRecoveryToken(""); setNeedsAuthenticator(false); }
          }
          finally { setBusy(false); }
        }}>
          <p className="text-sm text-slate-700">This account has an authenticator. Verify a current code before setting your new password.</p>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          {factors.length > 0 ? <>
            <label><span className="mb-1 block text-sm font-semibold text-slate-700">Authenticator</span><select className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" value={factorId} required onChange={(event) => setFactorId(event.target.value)}>{factors.map((factor) => <option value={factor.id} key={factor.id}>{factor.name}</option>)}</select></label>
            <label><span className="mb-1 block text-sm font-semibold text-slate-700">Six-Digit Code</span><input className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} required onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /></label>
            <Button type="submit" variant="primary" disabled={busy} icon={<ShieldCheck className="h-4 w-4" />}>Verify Authenticator</Button>
          </> : <Button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await loadFactors(recoveryToken); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load authenticator."); } finally { setBusy(false); } }}>Reload Authenticator</Button>}
          <p className="text-sm text-slate-600">If you no longer have this authenticator, contact your account administrator.</p>
        </form>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={handleSubmit(async (values) => {
            setBusy(true);
            setError("");
            try {
              if (foundationMode) {
                await apiClient.resetPassword("", values.password, recoveryToken);
                // Move first: clearing identity remounts the query-scoped subtree.
                navigate("/login", { replace: true, state: { passwordReset: true } });
                saveSession(null);
                return;
              }
              await resetPassword(values.email, values.password);
              setRecoveryToken("");
              setDone(true);
            } catch (error) {
              setError(error instanceof Error ? error.message : "Password update failed.");
              if (error instanceof ApiRequestError && error.status === 401) setRecoveryToken("");
              if (error instanceof ApiRequestError && error.status === 428) {
                setNeedsAuthenticator(true);
                await loadFactors(recoveryToken).catch(() => {});
              }
            }
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
            <input className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" type="password" autoComplete="new-password" aria-describedby={foundationMode ? "reset-password-requirements" : undefined} minLength={foundationMode ? 12 : 6} maxLength={128} required {...register("password")} />
          </label>
          {foundationMode ? <p id="reset-password-requirements" className="-mt-2 text-xs text-slate-500">At least 12 characters. Use a new, unique password, not your current password.</p> : null}
          <Button type="submit" variant="primary" disabled={busy || (foundationMode && !recoveryToken)} icon={<KeyRound className="h-4 w-4" />}>
            Save New Password
          </Button>
          {foundationMode && error && !recoveryToken ? <Link className="text-sm font-semibold text-blue-800 underline" to="/forgot-password">Request a new recovery email</Link> : null}
        </form>
      )}
    </AuthShell>
  );
}
