# Security Specification — Benishangul-Gumuz Police Commission System (Begu Rent)

## 1. Data Invariants
1. **Confidential Police Vault Isolation**: `/wanted_persons`, `/wanted_alerts`, `/criminal_records`, and `/police_vaults/{vaultKey}/...` MUST NEVER be accessible to Landlords. Only verified Police/Admin sessions holding the decrypted 256-bit `policeVaultKey` (or Google-verified `isPolice()`) can access confidential watch-lists, alerts, or criminal records. Parent `/police_vaults/{vaultKey}` forbids all reads/writes so vault keys cannot be listed.
2. **Non-Enumerable Zero-PII Auth Accounts**: `/auth_accounts/{accountKey}` explicitly blocks `list` (`allow list: if false;`) and stores zero PII. Credentials are verified via salted PBKDF2 hashes, and role capabilities (`policeVaultKey`, `workspaceSecret`) are AES-GCM encrypted with the user's password so they work seamlessly across any device or browser domain without Google OAuth popups.
3. **Per-Landlord Workspace Isolation**: Each Landlord holds a unique 256-bit `workspaceSecret` unwrapped upon login. `LandlordPortal` reads ONLY `/landlord_workspaces/{workspaceSecret}/properties`, `/tenants`, and `/history` (parent doc blocks reads/writes), guaranteeing each Landlord sees strictly their own properties, own tenants, and own history across all devices.
4. **Master Gate on Tenant Dispatch to Police**: Every landlord registration, property addition, address update, tenant registration, and tenant move-out writes atomically to both the Landlord's private workspace AND the shared Police dispatch collections (`/landlords`, `/tenants`, `/activity_history`) with strict schema validation (`isValidTenant` checks parent `landlordId` existence in `/landlords`).
5. **Immutable Audit Trail**: Documents in `/activity_history` and `/landlord_workspaces/{workspaceKey}/history` are append-only (`allow update, delete: if false;`), ensuring historical movements, address changes, replacements, and arrests can never be erased.
6. **Server Timestamp Integrity**: Every `createdAt` and `updatedAt` field must strictly equal `request.time`.
7. **Schema & Field Whitelist Integrity**: Every `create` and `update` enforces `hasAll(...)`, `hasOnly(...)`, `isValidId(...)` / `isValidVaultKey(...)`, strict string length bounds, and `affectedKeys().hasOnly(...)` on updates.

## 2. Adversarial Payloads
1. **Enumerating User Credentials**: Attacker calls `getDocs(collection(db, 'auth_accounts'))` -> `PERMISSION_DENIED` (`allow list: if false;`).
2. **Listing Police Vaults or Landlord Workspaces**: Attacker calls `getDocs(collection(db, 'police_vaults'))` or `collection(db, 'landlord_workspaces')` -> `PERMISSION_DENIED`.
3. **Landlord Reading Wanted List or Criminal Records**: Landlord tries `getDocs(collection(db, 'wanted_persons'))` or `getDoc(doc(db, 'criminal_records', 'rec1'))` -> `PERMISSION_DENIED`.
4. **Weak Vault Key Guess**: Client attempts writing to `/police_vaults/short_key/wanted_persons/w1` -> `PERMISSION_DENIED` (`isValidVaultKey` requires >= 48 chars).
5. **Ghost / Shadow Field Injection**: Client writes a `tenant` with extra field `isWanted: true` or `adminOverride: true` -> `PERMISSION_DENIED` (`hasOnly` check).
6. **Orphaned Tenant Record**: Client writes a `tenant` referencing non-existent `landlordId: 'fake_id'` -> `PERMISSION_DENIED` (`exists()` check).
7. **Deleting Audit History**: Client tries `deleteDoc(doc(db, 'activity_history', 'h1'))` -> `PERMISSION_DENIED`.
8. **Client-Spoofed Timestamp**: Client submits `createdAt: new Date('2020-01-01')` instead of `serverTimestamp()` -> `PERMISSION_DENIED` (`== request.time`).
9. **Path Variable ID Poisoning**: Client writes to `/tenants/invalid id with spaces` -> `PERMISSION_DENIED` (`isValidId`).
10. **Self-Promotion via Admins / Police Emails**: Unverified user tries writing to `/admins/{uid}` or `/police_emails/{email}` -> `PERMISSION_DENIED`.
11. **Mutating Officer/Admin Role in AuthAccounts**: Client tries updating `role` from `'landlord'` to `'admin'` on `/auth_accounts/{key}` -> `PERMISSION_DENIED` (`incoming().role == existing().role` and not in `affectedKeys().hasOnly`).
12. **Reading Legacy Admin Credentials Without Google Admin**: Non-admin tries reading `/admin_credentials/primary` -> `PERMISSION_DENIED`.
