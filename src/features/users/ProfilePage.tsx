import { Camera, KeyRound, Save,WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Button from "../../components/ui/Button";
import Avatar from "../../components/ui/Avatar";
import PageHeader from "../../components/ui/PageHeader";
import { Modal, Panel, inputClass, labelClass } from "../../domains/components";
import { useAuthStore } from "../../lib/auth/session";
import { useToastStore } from "../../lib/ui/toast";
import { foundationMode } from "../../lib/runtime";
import { apiClient } from "../../lib/api/client";
import { MfaControl } from "../auth/MfaSecurity";
import { canReadPayroll } from "../../domains/ledger/access";

type ProfileValues = {
  name: string;
  email: string;
  title: string;
  department: string;
  phone: string;
  avatarUrl: string;
};

export default function ProfilePage() {
  const navigate=useNavigate();
  const session = useAuthStore((state) => state.session);
  const updateUser = useAuthStore((state) => state.updateUser);
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const pushToast = useToastStore((state) => state.push);
  const [avatarPreview, setAvatarPreview] = useState(session?.user.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordValues, setPasswordValues] = useState({ current: "", password: "", confirm: "" });
  const { register, handleSubmit, setValue } = useForm<ProfileValues>({
    defaultValues: session?.user
  });

  useEffect(() => {
    if (!foundationMode || !session?.user.id) return;
    if (avatarFile) {
      const url = URL.createObjectURL(avatarFile);
      setAvatarPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    let active = true;
    const load = () => void apiClient.profileAvatar().then((response) => { if (active) setAvatarPreview(response.data?.url ?? ""); }).catch(() => {});
    load();
    const interval = window.setInterval(load, 45000);
    return () => { active = false; window.clearInterval(interval); };
  }, [session?.user.id, avatarFile]);

  if (!session) {
    return null;
  }

  return (
    <>
      <PageHeader
        eyebrow="Profile"
        title="Profile & Security Settings"
        actions={foundationMode?<>{canReadPayroll(session.user)?<Button icon={<WalletCards className="h-4 w-4"/>} onClick={()=>navigate("/backend/payroll")}>Payroll & Commission</Button>:null}<Button icon={<WalletCards className="h-4 w-4"/>} onClick={()=>navigate("/backend/payslips")}>My Payslips</Button></>:undefined}
        subtitle="Update profile photo and contact details. Your assigned role and capabilities remain locked for the signed-in session."
      />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm">
          <Avatar className="mx-auto h-36 w-36 rounded-full border-4 border-white object-cover shadow-lg" src={avatarPreview} name={session.user.name} />
          <h2 className="mt-4 text-xl font-bold text-slate-950">{session.user.name}</h2>
          <p className="text-sm text-slate-500">{session.user.role}</p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Camera className="h-4 w-4" />
            Upload Image
            <input
              className="hidden"
              type="file"
              accept={foundationMode ? "image/png,image/jpeg,image/webp" : "image/*"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                if (foundationMode) {
                  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) { setProfileError("Choose a PNG, JPEG or WebP image up to 2 MB."); return; }
                  setAvatarFile(file);
                  setProfileError("");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const value = String(reader.result);
                  setAvatarPreview(value);
                  setValue("avatarUrl", value);
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <div className="mt-5 grid gap-2 text-left text-sm">
            <span className="rounded-lg bg-slate-50 p-3">{session.user.email}</span>
            <span className="rounded-lg bg-slate-50 p-3">{session.user.department}</span>
          </div>
        </div>

        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={handleSubmit(async (values) => {
            setSaving(true);
            setProfileError("");
            try {
              if (foundationMode) {
                if (avatarFile) { await apiClient.uploadAvatar(session.user.id, avatarFile); setAvatarFile(null); }
                const response = await apiClient.saveProfile(values.name, values.phone);
                updateUser(response.data);
              } else updateUser({ ...session.user, ...values, avatarUrl: avatarPreview });
              pushToast({ kind: "success", title: "Profile saved" });
            } catch (error) { setProfileError(error instanceof Error ? error.message : "Profile could not be saved."); }
            finally { setSaving(false); }
          })}
        >
          {profileError ? <p role="alert" className="mb-4 text-sm text-red-700">{profileError}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["name", "Full Name"],
              ["email", "Email"],
              ["title", "Job Title"],
              ["department", "Department"],
              ["phone", "Phone"],
              ["avatarUrl", "Avatar URL"]
            ].filter(([key]) => !foundationMode || key !== "avatarUrl").map(([key, label]) => (
              <label key={key} className={key === "avatarUrl" ? "md:col-span-2" : ""}>
                <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
                <input
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  {...register(key as keyof ProfileValues, key === "avatarUrl" ? { onChange: (event) => setAvatarPreview(event.target.value) } : undefined)}
                  disabled={key === "email" || (foundationMode && ["title", "department"].includes(key))}
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit" disabled={saving} variant="primary" icon={<Save className="h-4 w-4" />}>
              Save Profile
            </Button>
            <Button type="button" icon={<KeyRound className="h-4 w-4" />} onClick={() => setPasswordOpen(true)}>
              Change Password
            </Button>
          </div>
        </form>
      </div>

      {foundationMode ? <Panel title="Authenticator Security"><div className="p-5"><MfaControl /></div></Panel> : null}
      <Modal open={passwordOpen} title="Change password" subtitle={foundationMode ? "Confirm your current password. Changing it signs out existing sessions." : "The updated password remains active until the temporary API state resets."} onClose={() => setPasswordOpen(false)}>
        <form className="grid gap-4" onSubmit={async (event) => {
          event.preventDefault();
          setPasswordError("");
          const minimum = foundationMode ? 12 : 6;
          if (passwordValues.password.length < minimum) return setPasswordError(`Password must contain at least ${minimum} characters.`);
          if (passwordValues.password !== passwordValues.confirm) return setPasswordError("Password confirmation does not match.");
          setPasswordBusy(true);
          try {
            if (foundationMode) await apiClient.changePassword(passwordValues.current, passwordValues.password);
            else await resetPassword(session.user.email, passwordValues.password);
            setPasswordOpen(false);
            setPasswordValues({ current: "", password: "", confirm: "" });
            pushToast({ kind: "success", title: "Password updated" });
            if (foundationMode) useAuthStore.getState().logout();
          } catch (error) {
            setPasswordError(error instanceof Error ? error.message : "Password could not be updated.");
          } finally {
            setPasswordBusy(false);
          }
        }}>
          {passwordError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{passwordError}</div> : null}
          {foundationMode ? <label><span className={labelClass}>Current Password</span><input className={inputClass} type="password" autoComplete="current-password" required value={passwordValues.current} onChange={(event) => setPasswordValues((current) => ({ ...current, current: event.target.value }))} /></label> : null}
          <label><span className={labelClass}>New Password</span><input className={inputClass} type="password" autoComplete="new-password" minLength={foundationMode ? 12 : 6} required value={passwordValues.password} onChange={(event) => setPasswordValues((current) => ({ ...current, password: event.target.value }))} /></label>
          <label><span className={labelClass}>Confirm Password</span><input className={inputClass} type="password" autoComplete="new-password" minLength={foundationMode ? 12 : 6} required value={passwordValues.confirm} onChange={(event) => setPasswordValues((current) => ({ ...current, confirm: event.target.value }))} /></label>
          <div className="flex justify-end"><Button type="submit" variant="primary" icon={<KeyRound className="h-4 w-4" />} disabled={passwordBusy}>Update Password</Button></div>
        </form>
      </Modal>
    </>
  );
}
