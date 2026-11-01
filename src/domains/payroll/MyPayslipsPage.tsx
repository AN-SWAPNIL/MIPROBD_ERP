import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Printer } from "lucide-react";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import { apiRequest } from "../../lib/api/client";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useAuthStore } from "../../lib/auth/session";
import { ErrorBlock,LoadingBlock,Panel,TableFrame } from "../components";
import { formatMoney } from "../../utils/precise";
import { WorkforcePager } from "../marketing/WorkforceUi";
export default function MyPayslipsPage(){const user=useAuthStore(s=>s.session?.user),navigate=useNavigate(),[page,setPage]=useState(1),q=useQuery({queryKey:["payroll","own-payslips",page],queryFn:async()=>z.object({rows:z.array(z.object({id:z.string(),number:z.string(),period:z.string(),gross:z.string(),net:z.string(),paid:z.string()})),total:z.number().int()}).parse((await apiRequest(`/api/me/payslips?page=${page}`)).data)});
 return <div className="grid gap-4"><PageHeader title="My Payslips" subtitle={user?.name}/><Panel title="Accrued Salary Records">{q.isPending?<LoadingBlock/>:q.isError?<ErrorBlock error={q.error}/>:<><TableFrame><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-blue-950 text-white"><tr>{["Salary Month","Payroll","Earned Gross","Net Salary","Actually Paid","Print Preview"].map(v=><th key={v} className="p-3">{v}</th>)}</tr></thead><tbody>{q.data.rows.map(r=><tr key={r.id} className="border-t border-blue-100"><td className="p-3">{r.period}</td><td className="p-3">{r.number}</td><td className="p-3">{formatMoney(r.gross)}</td><td className="p-3">{formatMoney(r.net)}</td><td className="p-3">{formatMoney(r.paid)}</td><td className="p-3">{hasEffectivePermission(user,"print")?<Button variant="primary" icon={<Printer className="h-4 w-4"/>} onClick={()=>navigate(`/backend/print/payslip/${r.id}`)}>Print Preview</Button>:null}</td></tr>)}</tbody></table></TableFrame>{!q.data.rows.length?<p className="p-6 text-sm text-slate-500">No accrued payslips are available for your user ID.</p>:null}<WorkforcePager page={page} pageSize={25} total={q.data.total} onChange={setPage}/></>}</Panel></div>;
}
