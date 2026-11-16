-- System configuration keys with safe starting values.
-- These are configuration, not sample data: every value is editable by a
-- System Administrator on screen 14 and every change is audited.
INSERT INTO system_setting (setting_key, setting_value, value_type, description) VALUES
 ('ID_SCAN_REUSE_DAYS',            '180', 'INTEGER', 'A stored identity scan may be reused for this many days before a fresh scan is required.'),
 ('HOST_RESPONSE_TIMEOUT_MINUTES', '15',  'INTEGER', 'Raise a reception alert when a host has not responded within this many minutes.'),
 ('VEHICLE_MAX_STAY_HOURS',        '12',  'INTEGER', 'Raise a gate exception when a vehicle stays inside longer than this.'),
 ('MAX_VISITS_PER_HOST_PER_DAY',   '25',  'INTEGER', 'Registration is blocked once a host has this many visits on the same day.'),
 ('MAX_ITEMS_PER_VISIT',           '20',  'INTEGER', 'Maximum declared items that can be recorded against one visit.'),
 ('QUEUE_REFRESH_SECONDS',         '10',  'INTEGER', 'How often live screens (queue, host inbox, dashboards) refresh.');
