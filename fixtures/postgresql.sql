-- Disposable fixture only. Do not apply to an existing production database.
CREATE TABLE catalog_fixture (id text PRIMARY KEY, name text NOT NULL, price numeric(12,2) NOT NULL, currency text NOT NULL, stock integer);
INSERT INTO catalog_fixture VALUES ('sample-001','Sample linen panjabi',1850.00,'BDT',12),('sample-002','Sample scarf',650.00,'BDT',NULL);
-- Operator creates a separate login securely, then grants only CONNECT, schema USAGE and SELECT.
-- GRANT USAGE ON SCHEMA public TO relaydesk_reader;
-- GRANT SELECT ON catalog_fixture TO relaydesk_reader;
-- ALTER ROLE relaydesk_reader SET default_transaction_read_only = on;
