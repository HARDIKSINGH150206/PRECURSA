CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    clerk_user_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ports (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    country TEXT NOT NULL DEFAULT '',
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS vessels (
    id BIGSERIAL PRIMARY KEY,
    mmsi TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    current_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    trail_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    origin_port_id BIGINT REFERENCES ports(id) ON DELETE SET NULL,
    destination_port_id BIGINT REFERENCES ports(id) ON DELETE SET NULL,
    current_location TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    cargo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    dri INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weather_snapshots (
    id BIGSERIAL PRIMARY KEY,
    port_id BIGINT REFERENCES ports(id) ON DELETE CASCADE,
    shipment_id TEXT REFERENCES shipments(id) ON DELETE CASCADE,
    zone_name TEXT NOT NULL DEFAULT '',
    temperature DOUBLE PRECISION NOT NULL DEFAULT 0,
    wind_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
    rain DOUBLE PRECISION NOT NULL DEFAULT 0,
    visibility DOUBLE PRECISION NOT NULL DEFAULT 0,
    severity INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'seed',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
    settings_key TEXT PRIMARY KEY,
    settings_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_origin_port_id ON shipments(origin_port_id);
CREATE INDEX IF NOT EXISTS idx_shipments_destination_port_id ON shipments(destination_port_id);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_port_id ON weather_snapshots(port_id);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_shipment_id ON weather_snapshots(shipment_id);
