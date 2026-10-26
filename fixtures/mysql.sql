-- Disposable fixture only. Do not apply to an existing production database.
CREATE TABLE catalog_fixture (id varchar(80) PRIMARY KEY, name varchar(180) NOT NULL, price decimal(12,2) NOT NULL, currency char(3) NOT NULL, stock integer NULL);
INSERT INTO catalog_fixture VALUES ('sample-001','Sample linen panjabi',1850.00,'BDT',12),('sample-002','Sample scarf',650.00,'BDT',NULL);
-- Create a separate TLS-required SELECT-only login through the database administrator.
-- GRANT SELECT ON your_fixture_database.catalog_fixture TO 'relaydesk_reader'@'your_restricted_egress';
