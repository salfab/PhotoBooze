# Storage Cleanup Scripts

## cleanup-orphaned-storage.mjs

Removes storage files that don't have corresponding database records (orphaned files from deleted parties).

### Usage

**Dry run (see what would be deleted):**
```bash
node scripts/cleanup-orphaned-storage.mjs --dry-run
```

**Actually delete orphaned files:**
```bash
node scripts/cleanup-orphaned-storage.mjs
```

### When to run

- After deleting parties manually from the database
- Periodically to clean up any orphaned files
- When upgrading from old delete logic that didn't remove subdirectories

### What it does

1. Fetches all active party IDs from the database
2. Lists all party folders in storage (`parties/{party-id}/`)
3. Identifies folders that don't match any active party
4. Scans subdirectories (`original/` and `tv/`) for files
5. Deletes all orphaned files in batches

### Safety

- Always shows summary before deletion
- Requires explicit confirmation (no `--dry-run` flag)
- Processes files in batches of 100 for reliability
- Provides detailed logging of what's being deleted

### Output

```
🧹 Starting storage cleanup...
   Mode: DRY RUN (no changes will be made)

✅ Found 5 active parties in database
📁 Found 8 party folders in storage
🗑️  Found 3 orphaned party folders:
   • party-id-1
   • party-id-2
   • party-id-3

📊 Total orphaned files: 120

💡 Run without --dry-run to actually delete these files
```

### After Party Deletion Fix

The party deletion endpoint was fixed in commit a4975e8 to properly delete files from subdirectories. After this fix, running party deletion through the API will correctly remove all files. This cleanup script is useful for:

- Cleaning up files from parties deleted before the fix
- Manual cleanup if API deletion fails
- Periodic maintenance
