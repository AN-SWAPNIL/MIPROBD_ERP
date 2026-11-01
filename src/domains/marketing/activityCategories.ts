import type { MarketingActivityType } from "../erp.types";

export const manualActivityCategoryGroups: Array<{
  label: string;
  options: Array<{ value: MarketingActivityType; label: string }>;
}> = [
  {
    label: "Customer & field engagement",
    options: [
      { value: "CUSTOMER_CONTACT", label: "Customer Call / Contact" },
      { value: "CUSTOMER_VISIT", label: "Hospital / Customer Visit" },
      { value: "DOCTOR_MEETING", label: "Doctor / Clinical Meeting" },
      { value: "PROCUREMENT_MEETING", label: "Procurement Meeting" },
      { value: "DEALER_VISIT", label: "Dealer / Distributor Visit" }
    ]
  },
  {
    label: "Product activity",
    options: [
      { value: "PRODUCT_PRESENTATION", label: "Product Presentation" },
      { value: "PRODUCT_DEMONSTRATION", label: "Product Demonstration" },
      { value: "SAMPLE_DELIVERED", label: "Sample Delivered" },
      { value: "TRAINING_SESSION", label: "Training / Workshop" }
    ]
  },
  {
    label: "Commercial follow-up",
    options: [
      { value: "NEGOTIATION_UPDATE", label: "Commercial Negotiation" },
      { value: "TENDER_FOLLOW_UP", label: "Tender / Quotation Follow-up" },
      { value: "COLLECTION_VISIT", label: "Collection Visit" },
      { value: "SERVICE_FOLLOW_UP", label: "Service / Complaint Follow-up" }
    ]
  },
  {
    label: "Market & internal work",
    options: [
      { value: "MARKET_SURVEY", label: "Market / Competitor Survey" },
      { value: "OFFICE_COORDINATION", label: "Office Coordination" },
      { value: "GENERAL_NOTE", label: "General Marketing Update" }
    ]
  }
];

export const manualActivityCategories = manualActivityCategoryGroups.flatMap((group) => group.options);

export const allMarketingActivityTypes: MarketingActivityType[] = [
  ...manualActivityCategories.map((option) => option.value),
  "LEAD_CREATED",
  "FOLLOW_UP_COMPLETED",
  "CHECK_IN",
  "CHECK_OUT",
  "QUOTATION_SUBMITTED",
  "ORDER_RECEIVED",
  "DELIVERY_POSTED",
  "PAYMENT_COLLECTED",
  "LEAD_CONVERTED"
];

export const activitiesWithoutCustomer: MarketingActivityType[] = ["MARKET_SURVEY", "OFFICE_COORDINATION", "GENERAL_NOTE"];

export const fieldActivityTypes: MarketingActivityType[] = [
  "CUSTOMER_VISIT",
  "DOCTOR_MEETING",
  "PROCUREMENT_MEETING",
  "DEALER_VISIT",
  "PRODUCT_DEMONSTRATION",
  "TRAINING_SESSION",
  "CHECK_IN",
  "CHECK_OUT"
];

export const salesResultActivityTypes: MarketingActivityType[] = [
  "NEGOTIATION_UPDATE",
  "TENDER_FOLLOW_UP",
  "COLLECTION_VISIT",
  "QUOTATION_SUBMITTED",
  "ORDER_RECEIVED",
  "DELIVERY_POSTED",
  "PAYMENT_COLLECTED"
];

export const followUpActivityTypes: MarketingActivityType[] = [
  "CUSTOMER_CONTACT",
  "FOLLOW_UP_COMPLETED",
  "SERVICE_FOLLOW_UP"
];

const labels = new Map<MarketingActivityType, string>([
  ...manualActivityCategories.map((option) => [option.value, option.label] as const),
  ["LEAD_CREATED", "Lead Created"],
  ["FOLLOW_UP_COMPLETED", "Follow-up Completed"],
  ["CHECK_IN", "Field Check-in"],
  ["CHECK_OUT", "Field Check-out"],
  ["QUOTATION_SUBMITTED", "Quotation Submitted"],
  ["ORDER_RECEIVED", "Order Received"],
  ["DELIVERY_POSTED", "Delivery Posted"],
  ["PAYMENT_COLLECTED", "Payment Collected"],
  ["LEAD_CONVERTED", "Lead Converted to Customer"]
]);

export function marketingActivityLabel(type: MarketingActivityType) {
  return labels.get(type) ?? type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (value) => value.toUpperCase());
}
