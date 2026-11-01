CREATE OR REPLACE FUNCTION erp_private.verify_stock_control_posting() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_cid text; v_control erp_private.stock_controls%ROWTYPE; v_line erp_private.stock_control_lines%ROWTYPE; v_post erp_private.stock_control_postings%ROWTYPE; v_batch erp_private.stock_batches%ROWTYPE; v_move erp_private.stock_movements%ROWTYPE; v_amount numeric; v_count integer; v_expected integer;
BEGIN
  IF TG_TABLE_NAME='stock_controls' THEN v_cid:=NEW.id;
  ELSIF TG_TABLE_NAME='stock_control_lines' THEN v_cid:=NEW.control_id;
  ELSIF TG_TABLE_NAME IN ('stock_control_postings','stock_hold_writeoffs','stock_condition_events') THEN SELECT control_id INTO v_cid FROM erp_private.stock_control_lines WHERE id=NEW.line_id;
  ELSIF TG_TABLE_NAME='stock_batches' THEN IF NEW.correction_line_id IS NULL THEN RETURN NULL; END IF; SELECT control_id INTO v_cid FROM erp_private.stock_control_lines WHERE id=NEW.correction_line_id;
  ELSE
    IF NEW.type<>'Adjustment' THEN RETURN NULL; END IF;
    SELECT l.control_id INTO v_cid FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE p.movement_id=NEW.id;
    IF v_cid IS NULL THEN RAISE EXCEPTION 'Adjustment needs an independently approved physical source' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT * INTO v_control FROM erp_private.stock_controls WHERE id=v_cid;
  SELECT count(*),CASE WHEN count(*) FILTER(WHERE value_bdt IS NULL)>0 THEN NULL ELSE sum(CASE WHEN v_control.kind='Condition Release' THEN book_value_bdt ELSE value_bdt END) END INTO v_count,v_amount FROM erp_private.stock_control_lines WHERE control_id=v_cid;
  IF v_control.id IS NULL OR v_count<1 OR v_count>50 OR v_amount IS DISTINCT FROM v_control.total_bdt THEN RAISE EXCEPTION 'Stock source lines and approval amount must reconcile' USING ERRCODE='23514'; END IF;
  IF v_control.state<>'Posted' THEN
    IF EXISTS(SELECT 1 FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE l.control_id=v_cid) OR EXISTS(SELECT 1 FROM erp_private.stock_batches b JOIN erp_private.stock_control_lines l ON l.id=b.correction_line_id WHERE l.control_id=v_cid) THEN RAISE EXCEPTION 'Unposted drafts cannot change stock or condition' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp_private.approval_requests a WHERE a.id=v_control.approval_id AND a.state='Posted' AND a.resource_type='Stock Control' AND a.resource_id=v_control.id AND a.payload_hash=v_control.payload_hash AND a.amount_bdt=v_control.total_bdt AND NOT(v_control.preparer_ids ? a.verified_by) AND NOT(v_control.preparer_ids ? a.approved_by)) THEN RAISE EXCEPTION 'Posted stock sources require independent exact approval' USING ERRCODE='23514'; END IF;
  FOR v_line IN SELECT * FROM erp_private.stock_control_lines WHERE control_id=v_cid LOOP
    SELECT * INTO v_post FROM erp_private.stock_control_postings WHERE line_id=v_line.id;
    IF v_post.id IS NULL OR v_post.date<>v_control.posted_date OR v_post.created_by<>v_control.posted_by THEN RAISE EXCEPTION 'Every stock line needs a matching atomic posting' USING ERRCODE='23514'; END IF;
    SELECT * INTO v_batch FROM erp_private.stock_batches WHERE id=v_post.batch_id;
    IF v_line.delta_quantity>0 THEN
      IF v_batch.correction_line_id IS DISTINCT FROM v_line.id OR v_batch.product_id IS DISTINCT FROM v_line.snapshot->>'productId' OR v_batch.quantity_received<>v_line.delta_quantity OR v_batch.received_value_bdt<>v_line.value_bdt OR v_batch.landed_cost_per_unit<>v_line.unit_cost_bdt OR v_batch.condition<>v_line.surplus_condition OR v_batch.lot_number IS DISTINCT FROM v_line.snapshot->>'lotNumber' OR v_batch.manufacturing_date IS DISTINCT FROM (v_line.snapshot->>'manufacturingDate')::date OR v_batch.expiry_date IS DISTINCT FROM (v_line.snapshot->>'expiryDate')::date OR v_batch.received_date<>v_control.count_date OR v_batch.source_reference<>v_control.number OR v_batch.warehouse IS DISTINCT FROM v_line.snapshot->>'warehouse' OR v_batch.location IS DISTINCT FROM v_line.snapshot->>'location' THEN RAISE EXCEPTION 'Surplus batch must inherit its independently approved count/cost source' USING ERRCODE='23514'; END IF;
    ELSIF v_post.batch_id<>v_line.batch_id THEN RAISE EXCEPTION 'Loss/release must reference the original batch' USING ERRCODE='23514'; END IF;
    IF v_line.delta_quantity=0 THEN
      IF v_post.movement_id IS NOT NULL THEN RAISE EXCEPTION 'A zero variance does not create a quantity movement' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO v_move FROM erp_private.stock_movements WHERE id=v_post.movement_id;
      IF v_move.id IS NULL OR v_move.type<>'Adjustment' OR v_move.batch_id<>v_post.batch_id OR v_move.quantity_delta<>v_line.delta_quantity OR v_move.value_bdt<>v_line.value_bdt OR v_move.date<>v_post.date OR v_move.reference<>v_control.number OR v_move.created_by<>v_control.posted_by THEN RAISE EXCEPTION 'Stock correction journal differs from its approved source' USING ERRCODE='23514'; END IF;
    END IF;
    v_expected:=CASE WHEN v_control.kind='Write-off' AND v_line.hold_id IS NOT NULL THEN 1 ELSE 0 END;
    IF (SELECT count(*) FROM erp_private.stock_hold_writeoffs WHERE line_id=v_line.id)<>v_expected OR (v_expected=1 AND NOT EXISTS(SELECT 1 FROM erp_private.stock_hold_writeoffs w WHERE w.line_id=v_line.id AND w.hold_id=v_line.hold_id AND w.quantity=-v_line.delta_quantity AND w.date=v_control.posted_date)) THEN RAISE EXCEPTION 'Held write-off must dispose, not release, its exact units' USING ERRCODE='23514'; END IF;
    v_expected:=CASE WHEN v_control.kind='Condition Release' THEN 1 ELSE 0 END;
    IF (SELECT count(*) FROM erp_private.stock_condition_events WHERE line_id=v_line.id)<>v_expected OR (v_expected=1 AND NOT EXISTS(SELECT 1 FROM erp_private.stock_condition_events e WHERE e.line_id=v_line.id AND e.batch_id=v_line.batch_id AND e.date=v_control.posted_date AND e.condition='Saleable')) THEN RAISE EXCEPTION 'Condition release needs its exact dated immutable event' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
