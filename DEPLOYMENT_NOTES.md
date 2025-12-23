# Deployment Notes

## Database Schema Evolution

This project uses a progressive database schema approach where newer features (like admin PIN protection) are added via migrations that may not be applied in all environments simultaneously.

### Admin PIN Feature

The admin PIN feature was added in migration `20241222000005_add_admin_pin.sql`. The code is designed to gracefully degrade when this column doesn't exist:

- **Parties API**: Falls back to querying without `admin_pin_hash` if the column doesn't exist
- **Token retrieval**: Continues without PIN protection if the column is missing  
- **Party management**: Returns appropriate error messages when PIN features aren't available

### CI/CD Resilience 

All admin PIN related code uses safe property access and fallback queries to prevent build failures in environments where migrations haven't been applied yet. This ensures:

1. ✅ Builds always pass, even if database schema is behind
2. ✅ Features gracefully degrade when not available
3. ✅ No runtime crashes due to missing columns
4. ✅ Clear logging when features are unavailable

### Deploying Schema Changes

When deploying the admin PIN migration:

1. Deploy the code changes first (they're backward compatible)
2. Apply the database migration: `supabase db push`
3. Regenerate TypeScript types: `supabase gen types typescript > src/types/supabase.ts`
4. The admin PIN feature will automatically become available

This approach prevents the classic "chicken and egg" problem where you need the schema for the code, but need the code deployed to run the migration.