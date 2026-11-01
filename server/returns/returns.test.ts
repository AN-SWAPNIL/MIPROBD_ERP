import test from "node:test";
import assert from "node:assert/strict";
import { returnInput, returnPageInput, returnSettlementInput } from "../../src/domains/sales/returnContracts.js";
import { remainingReturnCredit, returnedShare } from "./money.js";
import { D } from "../trading/money.js";

test("partial returns restore original saved cost, net sale and discount exactly once to poisha",()=>{
  const source={quantity:"3",costBdt:"10.01",creditBdt:"15.01",discountBdt:"0.02"};let prior={quantity:"0",costBdt:"0",creditBdt:"0",discountBdt:"0"};
  const costs:string[]=[];for(let i=0;i<3;i++){const part=returnedShare(source,prior,"1");costs.push(part.costBdt);prior={quantity:new D(prior.quantity).plus(1).toString(),costBdt:new D(prior.costBdt).plus(part.costBdt).toFixed(2),creditBdt:new D(prior.creditBdt).plus(part.creditBdt).toFixed(2),discountBdt:new D(prior.discountBdt).plus(part.discountBdt).toFixed(2)};}
  assert.deepEqual(costs,["3.34","3.33","3.34"]);assert.equal(prior.costBdt,source.costBdt);assert.equal(prior.creditBdt,source.creditBdt);assert.equal(prior.discountBdt,source.discountBdt);
  assert.throws(()=>returnedShare(source,prior,"1"));assert.throws(()=>returnedShare(source,{...prior,quantity:"0"},"0"));
});
test("return credit can settle original due, another invoice or a bounded actual refund, not twice",()=>{
  assert.deepEqual(remainingReturnCredit("100","70","10","-20"),{availableCreditBdt:"20.00",refundableBdt:"20.00"});
  assert.deepEqual(remainingReturnCredit("100","70","10","30"),{availableCreditBdt:"20.00",refundableBdt:"0.00"});
  assert.deepEqual(remainingReturnCredit("100","70","10","-5"),{availableCreditBdt:"20.00",refundableBdt:"5.00"});
  assert.throws(()=>remainingReturnCredit("1","1","0.01","-10"));
});
test("return contracts distinguish uninvoiced refusal and prohibit forged prices, identities and duplicate lines",()=>{
  const input={kind:"Invoiced Return",invoiceId:"i1",deliveryId:"d1",receivedDate:"2026-10-29",reason:"Customer returned goods",inspection:"Independently inspected packaging",proofReference:"QA-001",lines:[{deliveryLineId:"dl1",quantity:"0.0001",condition:"Quarantine",location:"QA-01"}]};
  assert.ok(returnInput.safeParse(input).success);assert.ok(returnInput.safeParse({...input,kind:"Uninvoiced Refusal",invoiceId:undefined}).success);
  for(const invalid of [{...input,kind:"Uninvoiced Refusal"},{...input,invoiceId:undefined},{...input,creditBdt:"99"},{...input,createdBy:"someone"},{...input,lines:[...input.lines,...input.lines]},{...input,lines:[{...input.lines[0],quantity:"0"}]},{...input,lines:[{...input.lines[0],quantity:"1e2"}]}])assert.equal(returnInput.safeParse(invalid).success,false);
  assert.equal(returnPageInput.safeParse({page:0}).success,false);
});
test("refund and credit application have explicit, separate destinations",()=>{
  const shared={amountBdt:"12.34",reason:"Approved returned goods credit",proofReference:"RF-001"};
  assert.ok(returnSettlementInput.safeParse({...shared,kind:"Refund",accountId:"bank"}).success);
  assert.ok(returnSettlementInput.safeParse({...shared,kind:"Apply Credit",invoiceId:"i2"}).success);
  assert.ok(returnSettlementInput.safeParse({...shared,kind:"Apply Credit",receivableEntryId:"approved-opening"}).success);
  assert.equal(returnSettlementInput.safeParse({...shared,kind:"Apply Credit",invoiceId:"i2",receivableEntryId:"approved-opening"}).success,false);
  assert.equal(returnSettlementInput.safeParse({...shared,kind:"Refund",accountId:"bank",receivableEntryId:"approved-opening"}).success,false);
  for(const invalid of [{...shared,kind:"Refund"},{...shared,kind:"Refund",invoiceId:"i2"},{...shared,kind:"Refund",accountId:"bank",invoiceId:"i2"},{...shared,kind:"Apply Credit",accountId:"bank"},{...shared,kind:"Refund",accountId:"bank",amountBdt:"0"}])assert.equal(returnSettlementInput.safeParse(invalid).success,false);
});
