import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import Button from "../../components/ui/Button";
import { ErrorBlock, LoadingBlock, Panel, inputClass, labelClass } from "../../domains/components";
import { apiRequest } from "../../lib/api/client";
import { mfaChallengeSchema, mfaEnrollmentSchema, mfaStatusSchema } from "../../lib/auth/mfaContracts";
import { useAuthStore } from "../../lib/auth/session";
import { saveSession } from "../../lib/auth/transport";
import type { Session } from "../../types";

const readStatus = async () => mfaStatusSchema.parse((await apiRequest("/api/auth/mfa")).data);
type Enrollment = z.infer<typeof mfaEnrollmentSchema>;
export function MfaControl() {
  const client = useQueryClient(); const logout = useAuthStore((s) => s.logout);
  const status = useQuery({ queryKey: ["auth-security", "mfa"], queryFn: readStatus, staleTime: 0 });
  const [setup, setSetup] = useState(false); const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [password, setPassword] = useState(""); const [code, setCode] = useState(""); const [factor, setFactor] = useState("");
  const [removing, setRemoving] = useState<string | null>(null); const [reason, setReason] = useState("");
  const run = useMutation({ mutationFn: (work: () => Promise<void>) => work(), onSuccess: () => { void client.invalidateQueries({ queryKey: ["auth-security"] }); } });
  if (status.isPending) return <LoadingBlock label="Loading authenticator status" />;
  if (status.isError) return <ErrorBlock error={status.error} onRetry={() => void status.refetch()} />;
  const verified = status.data.factors.filter((f) => f.status === "verified");
  const needsCode = status.data.security.enrolled && status.data.security.assurance !== "aal2";
  const selected = enrollment?.id || factor || verified[0]?.id || "";
  async function verify() {
    const challenge = mfaChallengeSchema.parse((await apiRequest("/api/auth/mfa/challenge", { method: "POST", body: JSON.stringify({ factorId: selected }) })).data);
    const response = await apiRequest<Session>("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ factorId: selected, challengeId: challenge.id, code }) });
    setCode(""); setPassword(""); setEnrollment(null); setSetup(false); saveSession(response.data);
  }
  return <div className="grid min-w-0 gap-4" data-testid="mfa-control">
    {run.isError ? <ErrorBlock error={run.error} /> : null}
    <p className="text-sm text-slate-600">{status.data.security.assurance === "aal2" ? "Authenticator verified for this session." : status.data.security.enrolled ? "Enter a current authenticator code to continue." : status.data.security.required ? "This privileged account requires an authenticator before ERP access." : "Authenticator is not enabled."}</p>
    {needsCode && !verified.length ? <p role="alert" className="text-sm text-red-700">This account has a different verification method. Contact the account administrator for recovery.</p> : null}
    {(needsCode && verified.length > 0 || enrollment) ? <form className="grid max-w-md gap-4" onSubmit={(e) => { e.preventDefault(); run.mutate(verify); }}>
      {enrollment ? <div className="grid justify-items-start gap-3"><img src={enrollment.qrCode} alt="Private authenticator setup QR code" className="h-48 w-48 bg-white" /><details className="max-w-full text-sm"><summary className="cursor-pointer font-semibold text-blue-950">Manual Setup Key</summary><code className="mt-2 block break-all rounded border border-blue-200 p-3">{enrollment.secret}</code></details><p className="text-xs text-slate-500">Keep this setup key private. Enter the code from your authenticator to activate it.</p></div> : <label><span className={labelClass}>Authenticator</span><select aria-label="Authenticator" className={inputClass} value={selected} onChange={(e) => setFactor(e.target.value)}>{verified.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}</select></label>}
      <label><span className={labelClass}>Six-Digit Code</span><input aria-label="Six-digit code" className={inputClass} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} required onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>
      <Button type="submit" variant="primary" icon={<ShieldCheck className="h-4 w-4" />} disabled={run.isPending}>Verify Authenticator</Button>
    </form> : null}
    {(!status.data.security.enrolled || setup) && !enrollment ? <form className="grid max-w-md gap-4" onSubmit={(e) => { e.preventDefault(); run.mutate(async () => { const data = mfaEnrollmentSchema.parse((await apiRequest("/api/auth/mfa/enroll", { method: "POST", body: JSON.stringify({ currentPassword: password, name: `Authenticator ${new Date().toISOString().slice(0, 16)}` }) })).data); setPassword(""); setEnrollment(data); }); }}>
      <label><span className={labelClass}>Current Password</span><input aria-label="Authenticator current password" className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label><Button variant="primary" type="submit" icon={<KeyRound className="h-4 w-4" />} disabled={run.isPending}>Set Up Authenticator</Button>
    </form> : null}
    {status.data.security.assurance === "aal2" && !enrollment && !setup ? <Button className="justify-self-start" icon={<Plus className="h-4 w-4" />} onClick={() => { run.reset(); setSetup(true); }}>Add Authenticator</Button> : null}
    {!enrollment ? <ul className="divide-y divide-blue-100">{status.data.factors.map((f) => <li className="flex min-w-0 items-center justify-between gap-3 py-3 text-sm" key={f.id}><span className="break-words">{f.name}<small className="block text-slate-500">{f.status === "verified" ? "Verified" : "Setup incomplete"}</small></span><Button title={`Remove ${f.name}`} aria-label={`Remove ${f.name}`} variant="ghost" disabled={run.isPending || f.status === "verified" && needsCode} icon={<Trash2 className="h-4 w-4" />} onClick={() => { run.reset(); setRemoving(f.id); setReason(""); }} /></li>)}</ul> : null}
    {removing ? <form className="grid gap-3 border-t border-blue-200 pt-4" onSubmit={(e) => { e.preventDefault(); run.mutate(async () => { const result = await apiRequest<{ signOut: boolean }>("/api/auth/mfa/remove", { method: "POST", body: JSON.stringify({ factorId: removing, reason }) }); setRemoving(null); setReason(""); if (result.data.signOut) logout(); }); }}><label><span className={labelClass}>Removal Reason</span><input className={inputClass} required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label><div className="flex gap-2"><Button type="submit" disabled={run.isPending}>Confirm Removal</Button><Button disabled={run.isPending} onClick={() => setRemoving(null)}>Cancel</Button></div></form> : null}
  </div>;
}
export default function MfaSecurityGate() {
  const session = useAuthStore((s) => s.session); const logout = useAuthStore((s) => s.logout);
  return <main className="grid min-h-screen place-items-center bg-[#eaf1f7] px-4 py-8"><div className="w-full max-w-xl"><a href="/"><img src="/mipro-logo.png" alt="MIPRO Healthcare" className="mb-6 h-12 w-44 object-contain" /></a><Panel title="Account Verification" subtitle={`${session?.user.name ?? ""} | ${session?.user.role ?? ""}`}><div className="grid gap-5 p-5"><MfaControl /><Button className="justify-self-start" icon={<LogOut className="h-4 w-4" />} onClick={logout}>Sign out</Button></div></Panel></div></main>;
}
