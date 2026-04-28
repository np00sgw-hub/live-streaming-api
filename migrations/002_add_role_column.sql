-- Migration: Add role-based authentication support
-- Date: 2026-04-27
-- Description: Add 'role' column to users table with values: 'user' | 'admin' | 'owner'
--              Migrate existing data from is_admin/is_agency flags to new role system

-- Step 1: Add role column with default value 'user'
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' NOT NULL;

-- Step 2: Migrate existing data based on is_admin and is_agency flags
-- Priority: If both is_admin and is_agency are true, role should be 'owner' (owner takes precedence)
-- Otherwise: is_admin=true → role='admin', is_agency=true → role='owner', both false → role='user'
UPDATE users 
SET role = CASE 
    WHEN is_agency = true THEN 'owner'      -- Owner takes priority (even if also admin)
    WHEN is_admin = true THEN 'admin'       -- Admin (if not owner)
    ELSE 'user'                             -- Regular user
END
WHERE role = 'user';  -- Only update default 'user' values

-- Step 3: Create index for fast role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Step 4: Verify migration (optional - check counts)
-- SELECT role, COUNT(*) as count FROM users GROUP BY role;

-- Optional: Add constraint to ensure only valid roles
-- ALTER TABLE users ADD CONSTRAINT valid_role CHECK (role IN ('user', 'admin', 'owner'));
