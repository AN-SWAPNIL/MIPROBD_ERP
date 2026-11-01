import { D } from "../trading/money.js";
import type { LedgerPostingPlan } from "../../src/domains/ledger/contracts.js";
export function claimCost(poolQuantity:string,poolValue:string,priorQuantity:string,priorValue:string,quantity:string){const q=new D(quantity),pool=new D(poolQuantity),before=new D(priorQuantity);if(pool.lte(0)||q.lte(0)||before.lt(0)||before.plus(q).gt(pool)||new D(poolValue).lt(0)||new D(priorValue).lt(0))throw new Error("Claim exceeds its original remaining source");const value=new D(poolValue).times(before.plus(q)).div(pool).toDecimalPlaces(2).minus(priorValue);if(value.lt(0))throw new Error("Claim value requires source reconciliation");return value.toFixed(2);}
export function claimPlan(sourceKind:string,resolution:string,cost:string,credit:string|null):LedgerPostingPlan{
 const value=new D(cost),amount=new D(credit??0),plan:LedgerPostingPlan=[];const line=(role:LedgerPostingPlan[number]["role"],debit:InstanceType<typeof D>,cr:InstanceType<typeof D>)=>{if(!debit.isZero()||!cr.isZero())plan.push({role,debit:debit.toFixed(2),credit:cr.toFixed(2)});};const zero=new D(0),origin=sourceKind==="Held Stock"?"Inventory":"Inventory Clearing";
 if(resolution==="Credit"){if(amount.lte(0))throw new Error("Supplier credit needs an explicit positive agreed amount");line("Payables",amount,zero);line(origin,zero,value);if(value.gt(amount))line("Stock Loss",value.minus(amount),zero);if(amount.gt(value))line("Stock Gain",zero,amount.minus(value));}
 else if(resolution==="Replacement"){line("Supplier Claims",value,zero);line(origin,zero,value);}
 else if(resolution==="Write-off"){line("Stock Loss",value,zero);line(origin,zero,value);}
 else throw new Error("Unknown supplier resolution");return plan;
}
