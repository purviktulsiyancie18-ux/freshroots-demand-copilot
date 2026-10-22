-- Integrity rule (§9): recommended_qty is written once, by the rules step, at insert time.
-- Any later UPDATE that tries to change it (e.g. from an AI code path) is rejected by the database.
CREATE OR REPLACE FUNCTION guard_recommended_qty() RETURNS trigger AS $$
BEGIN
  IF NEW.recommended_qty IS DISTINCT FROM OLD.recommended_qty THEN
    RAISE EXCEPTION 'recommended_qty is owned by the rules engine and cannot be updated (recommendation %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER recommendations_qty_guard
  BEFORE UPDATE ON recommendations
  FOR EACH ROW EXECUTE FUNCTION guard_recommended_qty();
--> statement-breakpoint
ALTER TABLE recommendations ADD CONSTRAINT recommended_qty_non_negative CHECK (recommended_qty >= 0);
