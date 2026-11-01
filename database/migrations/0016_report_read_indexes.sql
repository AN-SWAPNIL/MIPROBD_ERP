CREATE INDEX "account_journal_date_idx" ON "erp_private"."account_transactions" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "erp_private"."audit_events" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "customer_journal_date_idx" ON "erp_private"."customer_entries" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "customer_journal_collection_idx" ON "erp_private"."customer_entries" USING btree ("collection_id","date");--> statement-breakpoint
CREATE INDEX "invoice_owner_date_idx" ON "erp_private"."sales_invoices" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "invoice_date_idx" ON "erp_private"."sales_invoices" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "movement_date_idx" ON "erp_private"."stock_movements" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "supplier_journal_date_idx" ON "erp_private"."supplier_settlements" USING btree ("date","id");