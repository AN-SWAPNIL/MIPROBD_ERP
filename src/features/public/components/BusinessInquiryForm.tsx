import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Mail, MessageCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { publicSiteService } from "../publicSiteService";
import type { PublicInquiryInput } from "../public.types";
import { foundationMode } from "../../../lib/runtime";
import { usePublicSettings } from "../usePublicSettings";

const inquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  organization: z.string().trim().max(140),
  phone: z.string().trim().min(7, "Enter a valid phone number.").max(30),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.").max(160)]),
  subject: z.string().trim().max(140),
  productInterest: z.string().trim().max(140),
  message: z.string().trim().min(10, "Please provide at least 10 characters.").max(2000)
});

type InquiryFormValues = z.infer<typeof inquirySchema>;

const inputClass = "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";

export default function BusinessInquiryForm() {
  const [searchParams] = useSearchParams();
  const products = useQuery({ queryKey: ["public", "products", "inquiry"], queryFn: () => publicSiteService.products() });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<InquiryFormValues | null>(null);
  const settings = usePublicSettings().data;
  const form = useForm<InquiryFormValues>({
    defaultValues: {
      name: "",
      organization: "",
      phone: "",
      email: "",
      subject: searchParams.get("subject") ?? "Product inquiry",
      productInterest: searchParams.get("product") ?? "",
      message: ""
    }
  });
  useEffect(() => {
    const product = searchParams.get("product");
    const subject = searchParams.get("subject");
    if (product) form.setValue("productInterest", product);
    if (subject) form.setValue("subject", subject);
  }, [form, searchParams]);

  const submit = useMutation({
    mutationFn: (payload: PublicInquiryInput) => publicSiteService.submitInquiry(payload),
    onSuccess: () => {
      form.reset({ name: "", organization: "", phone: "", email: "", subject: "Product inquiry", productInterest: "", message: "" });
      setFormErrors({});
    }
  });

  if (draft && settings) {
    const message = [`Name: ${draft.name}`, `Organization: ${draft.organization}`, `Phone: ${draft.phone}`, `Email: ${draft.email}`, `Product: ${draft.productInterest}`, "", draft.message].join("\n");
    return <div className="rounded-md border border-blue-200 bg-blue-50 p-5" role="status"><h2 className="text-xl font-bold text-blue-950">Inquiry ready to send</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your message has not been sent or stored. Choose a contact channel to send it to MIPRO.</p><div className="mt-5 flex flex-wrap gap-3"><a className="inline-flex items-center gap-2 rounded-md bg-blue-900 px-4 py-3 text-sm font-semibold text-white" href={`mailto:${settings.email}?subject=${encodeURIComponent(draft.subject || "Product inquiry")}&body=${encodeURIComponent(message)}`}><Mail className="h-4 w-4" />Open Email</a><a className="inline-flex items-center gap-2 rounded-md border border-emerald-600 bg-white px-4 py-3 text-sm font-semibold text-emerald-800" href={`https://wa.me/${settings.whatsappHref}?text=${encodeURIComponent(`${draft.subject}\n\n${message}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Open WhatsApp</a></div><button className="mt-5 text-sm font-semibold text-blue-900 underline" type="button" onClick={() => setDraft(null)}>Edit Message</button></div>;
  }
  if (submit.data) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6" role="status">
        <CheckCircle2 className="h-8 w-8 text-emerald-700" />
        <h2 className="mt-4 text-xl font-bold text-emerald-950">Your inquiry has been received.</h2>
        <p className="mt-2 text-sm leading-6 text-emerald-900">Reference: <strong>{submit.data.inquiryId}</strong>. The prototype records this submission in the running mock API session.</p>
        <button className="mt-5 rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800" type="button" onClick={() => submit.reset()}>Send another inquiry</button>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit((values) => {
      const parsed = inquirySchema.safeParse(values);
      if (!parsed.success) {
        setFormErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
        return;
      }
      setFormErrors({});
      if (foundationMode) { setFormErrors({}); setDraft(parsed.data); }
      else submit.mutate(parsed.data);
    })}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Name *</span><input className={inputClass} {...form.register("name")} autoComplete="name" />{formErrors.name ? <small className="mt-1 block text-red-700">{formErrors.name}</small> : null}</label>
        <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Organization</span><input className={inputClass} {...form.register("organization")} autoComplete="organization" /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Phone *</span><input className={inputClass} {...form.register("phone")} autoComplete="tel" />{formErrors.phone ? <small className="mt-1 block text-red-700">{formErrors.phone}</small> : null}</label>
        <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Email</span><input className={inputClass} type="email" {...form.register("email")} autoComplete="email" />{formErrors.email ? <small className="mt-1 block text-red-700">{formErrors.email}</small> : null}</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Subject</span><input className={inputClass} {...form.register("subject")} /></label>
        <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Product interest</span><select className={inputClass} {...form.register("productInterest")}><option value="">General inquiry</option>{(products.data ?? []).map((product) => <option value={product.name} key={product.slug}>{product.name}</option>)}</select></label>
      </div>
      <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Message *</span><textarea className="min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" {...form.register("message")} />{formErrors.message ? <small className="mt-1 block text-red-700">{formErrors.message}</small> : null}</label>
      {submit.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{submit.error.message}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-slate-500">{foundationMode ? "Prepare a message for MIPRO by email or WhatsApp. No message is sent until you send it in the selected app." : "This form creates a business inquiry only. It does not create an ERP account or disclose internal product data."}</p>
        <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-blue-900 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60" type="submit" disabled={submit.isPending || (foundationMode && !settings)}><Send className="h-4 w-4" /> {foundationMode ? "Prepare Inquiry" : submit.isPending ? "Sending..." : "Send inquiry"}</button>
      </div>
    </form>
  );
}
