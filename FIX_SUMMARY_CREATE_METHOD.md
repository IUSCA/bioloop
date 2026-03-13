# Fix Summary: create_method Migration Bug

**Date**: 2026-03-11  
**Status**: ✅ FIXED

---

## Bug Fixed

### `register_ondemand.py` Line 337

**Original Code** (BROKEN):
```python
conflicted_dataset_creation_log = [log for log in conflicted['audit_logs'] 
                                   if log['create_method'] == 'ON_DEMAND'][0]
```

**Problem**:
- Tried to filter `audit_logs` by `log['create_method']`
- But migration removes `create_method` from `dataset_audit` table
- Would cause `KeyError` after migration runs

**Fixed Code**:
```python
# Check if dataset was created via ON_DEMAND method (create_method is now on dataset, not audit_logs)
if conflicted.get('create_method') != 'ON_DEMAND':
    logger.info(
        f"Conflicting dataset {d['name']} has create_method="
        f"{conflicted.get('create_method')}, not ON_DEMAND - skipping workflow initiation"
    )
    continue

# Find the creation audit log to verify the creator user
conflicted_dataset_creation_log = next(
    (log for log in conflicted['audit_logs'] if log['action'] == 'create'),
    None
)

if not conflicted_dataset_creation_log:
    logger.warning(
        f"No creation audit log found for dataset {d['name']} - "
        f"cannot verify creator, skipping workflow initiation"
    )
    continue

if not conflicted_dataset_creation_log.get('user'):
    logger.warning(
        f"Creation audit log for dataset {d['name']} has no user - "
        f"creator was likely deleted, skipping workflow initiation"
    )
    continue
```

**Changes**:
1. ✅ Check `conflicted.get('create_method')` on the dataset (new location)
2. ✅ Filter audit logs by `log['action'] == 'create'` instead of `create_method`
3. ✅ Use `next()` with None default to avoid IndexError
4. ✅ Added defensive null checks for missing audit log or user
5. ✅ Improved error messages with context

---

## API Response Verification

### Endpoint: `GET /api/datasets`

**API Route**: `/api/src/routes/datasets/index.js` (lines 176-244)

**Query Parameters Used by Workers**:
```python
api.get_all_datasets(
    dataset_type='DATA_PRODUCT',
    name='some-dataset',
    match_name_exact=True,
    include_audit_logs=True  # ← Includes audit_logs relation
)
```

**API Response Structure**:
```json
{
  "metadata": { "count": 1 },
  "datasets": [
    {
      "id": 123,
      "name": "dataset-name",
      "type": "DATA_PRODUCT",
      "create_method": "ON_DEMAND",  // ✅ Returned by default (all columns)
      "origin_path": "/path/to/data",
      "created_at": "2026-03-11T...",
      "updated_at": "2026-03-11T...",
      // ... other dataset fields ...
      "audit_logs": [                 // ✅ When include_audit_logs=true
        {
          "id": 456,
          "action": "create",
          "timestamp": "2026-03-11T...",
          "user": {
            "id": 789,
            "username": "scadev",
            "name": "SCA Service"
          }
          // ❌ NO create_method field (removed from dataset_audit)
        }
      ]
    }
  ]
}
```

**Key Points**:
- ✅ `dataset.create_method` **IS** returned (nullable column on dataset table)
- ✅ `audit_logs` **ARE** included when `include_audit_logs=true`
- ❌ `audit_logs[].create_method` **IS NOT** included (column removed by migration)
- ✅ `audit_logs[].action` field is available for filtering creation events

---

## Code Review: Other Usages

### ✅ Worker Scripts - No Issues Found

Checked all worker scripts that call `get_all_datasets()` or `get_dataset()`:

1. **`manage_upload_workflows.py`** ✅
   - Calls `get_dataset()`, `get_stalled_uploads()`, `get_failed_uploads()`
   - Does NOT access `create_method` field
   - No changes needed

2. **`verify_upload_integrity.py`** ✅
   - Does NOT call dataset endpoints
   - No changes needed

3. **`populate_bundles.py`** ✅
   - Calls `get_all_datasets(archived=True, bundle=True)`
   - Does NOT access `create_method` field
   - No changes needed

4. **`purge_staged_datasets.py`** ✅
   - Calls `get_all_datasets(days_since_last_staged=...)`
   - Does NOT access `create_method` field
   - No changes needed

5. **`register_ondemand.py`** ✅ **FIXED**
   - Was accessing `audit_logs[].create_method` ❌
   - Now uses `dataset.create_method` ✅
   - Fixed to filter by `action='create'` ✅

### ✅ UI Components - No Issues Found

Checked all UI components that reference `create_method`:

1. **`ui/src/constants.js`** ✅
   - Defines `DATASET_CREATE_METHODS` constants
   - No consumption of API responses
   - No changes needed

2. **`ui/src/components/dataset/import/ImportStepper.vue`** ✅
   - Line 488: Sets `create_method: Constants.DATASET_CREATE_METHODS.IMPORT`
   - This is **setting** the value when creating a dataset (write operation)
   - Does NOT read `create_method` from API responses
   - No changes needed

3. **`ui/src/components/dataset/DatasetInfo.vue`** ✅
   - Lines 88-97: **COMMENTED OUT** code that would filter audit_logs by `create_method`
   - Since it's commented, it's safe
   - If ever uncommented, should use `dataset.create_method` instead

---

## Migration Behavior Recap

### What the Migration Does

**File**: `api/prisma/migrations/20260311000000_upload_rewrite/migration.sql`

1. **Adds `create_method` to dataset table** (nullable)
   ```sql
   ALTER TABLE "dataset"
       ADD COLUMN "create_method" "DATASET_CREATE_METHOD";
   ```

2. **Backfills from dataset_audit**
   ```sql
   UPDATE "dataset" d
   SET    "create_method" = source.create_method
   FROM   (SELECT DISTINCT ON ("dataset_id") ...)
   WHERE  d.create_method IS NULL;
   ```

3. **Removes `create_method` from dataset_audit**
   ```sql
   DROP INDEX "dataset_audit_dataset_id_create_method_key";
   ALTER TABLE "dataset_audit" DROP COLUMN "create_method";
   ```

### Result

- ✅ `dataset.create_method` exists (nullable)
- ❌ `dataset_audit.create_method` no longer exists
- ✅ Legacy datasets will have NULL `create_method` (safe, expected)
- ✅ New datasets created after migration will have `create_method` set

---

## Testing Recommendations

### Unit Tests

1. **Test API response includes `create_method`**:
   ```javascript
   it('should return create_method field on dataset', async () => {
     const datasets = await api.get_all_datasets({ 
       dataset_type: 'DATA_PRODUCT',
       name: 'test-dataset',
       match_name_exact: true 
     });
     expect(datasets[0]).toHaveProperty('create_method');
   });
   ```

2. **Test API response does NOT include `create_method` on audit_logs**:
   ```javascript
   it('should not return create_method on audit_logs', async () => {
     const datasets = await api.get_all_datasets({ 
       include_audit_logs: true 
     });
     if (datasets[0].audit_logs?.length > 0) {
       expect(datasets[0].audit_logs[0]).not.toHaveProperty('create_method');
     }
   });
   ```

3. **Test register_ondemand handles NULL `create_method`**:
   ```python
   def test_register_ondemand_skips_non_ondemand_datasets(self):
       # Simulate dataset with NULL create_method
       dataset = {'id': 123, 'name': 'test', 'create_method': None, 'audit_logs': [...]}
       # Should skip without error
   ```

### Integration Tests

1. Run migration on test database
2. Verify `register_ondemand.py` works with conflicting datasets
3. Verify no KeyError or IndexError occurs
4. Verify proper logging of skipped datasets

---

## Summary

### ✅ Completed Actions

1. **Fixed critical bug in `register_ondemand.py`**
   - Now uses `dataset.create_method` instead of `audit_logs[].create_method`
   - Added defensive null checks
   - Improved error messages

2. **Verified API returns `create_method` correctly**
   - `dataset.create_method` is included in responses (nullable)
   - `audit_logs[].create_method` is NOT included (column removed)

3. **Audited all code accessing API responses**
   - No other worker scripts access `create_method`
   - UI components either set it (write) or have code commented out
   - No additional changes needed

### 🎯 Deployment Readiness

- ✅ Critical bug fixed
- ✅ API verified to return correct schema
- ✅ All consumers of API audited
- ✅ No additional code changes required
- ⚠️ Recommend adding unit tests before deployment
- ⚠️ Consider monitoring logs for NULL `create_method` cases

### 📝 Notes

- Legacy datasets with NULL `create_method` are expected and safe
- Code uses `.get('create_method')` for safe dictionary access
- Filtering by `action='create'` is the correct way to find creation audit logs
