import { Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { demoMode, foundationMode } from "../../lib/runtime";
import AuthShell from "./AuthShell";

export default function ForgotPasswordPage() {
  const forgotPassword = useAuthStore((store) => store.forgotPassword);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit } = useForm<{ email: string }>({ defaultValues: { email: demoMode ? "accounts@mipro.local" : "" } });

  return (
    <AuthShell title="Forgot password" subtitle="Request password recovery for an assigned ERP account.">
      {sent ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-blue-800">
          <strong>{foundationMode ? "Recovery request received." : "Reset link generated."}</strong>
          <p className="mt-2 text-sm">If the address belongs to an assigned account, continue with the recovery instructions.</p>
          {!foundationMode ? <Link className="mt-4 inline-block font-bold underline" to="/reset-password">
            Continue to reset password
          </Link> : null}
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={handleSubmit(async (values) => {
            setBusy(true);
            setError("");
            try { await forgotPassword(values.email); setSent(true); }
            catch (error) { setError(error instanceof Error ? error.message : "Recovery request failed."); }
            finally { setBusy(false); }
          })}
        >
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Email</span>
            <input className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" {...register("email")} />
          </label>
          <Button type="submit" variant="primary" disabled={busy} icon={<Mail className="h-4 w-4" />}>
            Send Reset Link
          </Button>
          <Link className="text-sm font-semibold text-teal-700" to="/login">
            Back to login
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
