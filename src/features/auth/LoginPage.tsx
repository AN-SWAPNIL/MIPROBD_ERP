import { useQuery } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import Button from "../../components/ui/Button";
import { apiClient } from "../../lib/api/client";
import { useAuthStore } from "../../lib/auth/session";
import { demoMode, foundationMode } from "../../lib/runtime";
import { useToastStore } from "../../lib/ui/toast";
import AuthShell from "./AuthShell";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

type LoginValues = z.infer<typeof loginSchema>;

type LocationState = {
  from?: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const login = useAuthStore((store) => store.login);
  const pushToast = useToastStore((store) => store.push);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setValue } = useForm<LoginValues>({
    defaultValues: { email: demoMode ? "superadmin@mipro.local" : "", password: demoMode ? "password123" : "" }
  });
  const demoUsers = useQuery({
    queryKey: ["demo-users"],
    queryFn: async () => (await apiClient.demoUsers()).data,
    enabled: demoMode
  });

  const submit = async (values: LoginValues) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setFormError("Enter a valid email and password.");
      return;
    }

    try {
      await login(parsed.data.email, parsed.data.password);
      pushToast({ kind: "success", title: "Signed in", message: "Role-based ERP session started." });
      navigate(foundationMode ? "/backend" : state?.from ?? "/app/dashboard", { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Login failed.");
    }
  };

  return (
    <AuthShell title="Sign in to MIPRO ERP" subtitle={demoMode ? "Demo mode is active. Select a role account or enter an assigned credential." : "Enter your assigned employee credentials. Access is controlled by role and capability."}>
      <form className="grid gap-4" onSubmit={handleSubmit(submit)}>
        {formError ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{formError}</div> : null}
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Email</span>
          <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" {...register("email")} />
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Password</span>
          <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" type="password" {...register("password")} />
        </label>
        <Button variant="primary" type="submit" icon={<LogIn className="h-4 w-4" />}>
          Sign In
        </Button>
      </form>

      <div className="mt-5 flex justify-end text-sm">
        <Link className="font-semibold text-cyan-700 hover:text-cyan-800" to="/forgot-password">
          Forgot password?
        </Link>
      </div>

      {demoMode ? <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-bold uppercase text-amber-900">Demo role accounts</p>
        <p className="mb-3 mt-1 text-xs text-amber-800">Select an account to fill the form. Password: <strong>password123</strong></p>
        {demoUsers.isLoading ? <p className="text-sm font-semibold text-slate-600">Loading role accounts...</p> : null}
        {demoUsers.isError ? <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">Demo accounts could not be loaded. Restart or redeploy both the website and API with demo mode enabled.</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {(demoUsers.data ?? []).filter((user, index, users) => users.findIndex((candidate) => candidate.role === user.role) === index).map((user) => (
            <button
              className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
              key={user.email}
              type="button"
              onClick={() => {
                setValue("email", user.email);
                setValue("password", "password123");
                setFormError(null);
              }}
            >
              <strong className="block text-sm text-slate-950">{user.role}</strong>
              <span className="block text-xs text-slate-500">{user.email}</span>
            </button>
          ))}
        </div>
      </div> : null}
    </AuthShell>
  );
}
