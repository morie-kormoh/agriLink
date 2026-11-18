-- Hand-written migration: things Prisma's schema language can't express.

-- 1) Keep FarmPlot.geom (PostGIS point) in sync with latitude/longitude.
CREATE OR REPLACE FUNCTION agripay_farmplot_set_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS farmplot_set_geom ON "FarmPlot";
CREATE TRIGGER farmplot_set_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "FarmPlot"
  FOR EACH ROW EXECUTE FUNCTION agripay_farmplot_set_geom();

-- 2) AuditLog is append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION agripay_auditlog_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_immutable ON "AuditLog";
CREATE TRIGGER auditlog_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION agripay_auditlog_immutable();
