-- CHECK expressions returning NULL pass in PostgreSQL; require every JSON key explicitly.
ALTER TABLE erp_private.field_visits ADD CONSTRAINT field_position_required_keys CHECK (
  position IS NULL OR coalesce(
    jsonb_typeof(position)='object' AND position ?& ARRAY['latitude','longitude','accuracy','capturedAt'],
    false
  )
);
