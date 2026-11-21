# Security Specification — Benishangul-Gumuz Police Commission System

## 1. Data Invariants
1. **Confidential Wanted List Isolation**: `wanted_persons`, `wanted_alerts`, and `criminal_records` MUST NEVER be readable (`get` or `list`) or writable by Landlords or unauthenticated users. Only `isPolice()` (verified Police Officers or Super Admins) may access them.
2. **Master Gate on Tenant Creation**: A `tenant` document cannot be created unless its parent `landlordId` exists in `/landlords/{landlordId}` and belongs to `request.auth.uid` (unless created by `isPolice()` / `isAdmin()`), and `landlordUid == request.auth.uid` (or `isPolice()`).
3. **Zero Self-Escalation**: No user may create or mutate documents in `/admins`, `/police_emails`, `/police_officers`, or `/system_settings` unless they satisfy `isAdmin()`.
4. **Immutable Audit Trail**: Documents in `/activity_history` are append-only (`allow update, delete: if false;`), ensuring historical movements, address changes, replacements, and arrests can never be erased.
5. **Server Timestamp Integrity**: Every `createdAt` and `updatedAt` field must strictly equal `request.time`.
6. **Landlord Ownership & PII Isolation**: Landlords can ONLY `get` and `list` their own `/landlords` (`ownerUid == request.auth.uid`) and `/tenants` (`landlordUid == request.auth.uid`).
7. **Admin Credential Isolation**: `/admin_credentials` is strictly readable and writable by `isAdmin()` only (`allow list: if false;`), and cannot be accessed by officers, landlords, or unauthenticated users.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Landlord Reading Wanted List**: Landlord tries `getDocs(collection(db, 'wanted_persons'))` -> `PERMISSION_DENIED`.
2. **Landlord Reading Criminal Records**: Landlord tries `getDoc(doc(db, 'criminal_records', 'rec1'))` -> `PERMISSION_DENIED`.
3. **Self-Promotion to Admin**: Authenticated non-admin tries `setDoc(doc(db, 'admins', uid), ...)` -> `PERMISSION_DENIED`.
4. **Self-Promotion to Police**: Authenticated non-admin tries `setDoc(doc(db, 'police_emails', email), ...)` -> `PERMISSION_DENIED`.
5. **Ghost / Shadow Field Injection**: Landlord tries creating a `tenant` with extra field `isWanted: true` or `adminOverride: true` -> `PERMISSION_DENIED` (`hasOnly` check).
6. **Impersonating Another Landlord**: User A tries creating a `tenant` with `landlordUid: userB_uid` -> `PERMISSION_DENIED`.
7. **Orphaned Tenant Record**: User tries creating a `tenant` referencing non-existent `landlordId: 'fake_id'` -> `PERMISSION_DENIED` (`exists()` check).
8. **Deleting Audit History**: Police officer or landlord tries `deleteDoc(doc(db, 'activity_history', 'h1'))` -> `PERMISSION_DENIED`.
9. **Client-Spoofed Timestamp**: Client submits `createdAt: new Date('2020-01-01')` instead of `serverTimestamp()` -> `PERMISSION_DENIED` (`== request.time`).
10. **Path Variable ID Poisoning**: Client writes to `/tenants/invalid id with spaces and 2kb payload...` -> `PERMISSION_DENIED` (`isValidId`).
11. **Unverified Email Bypass**: User with `email_verified: false` tries writing to `/landlords` -> `PERMISSION_DENIED`.
12. **Reading Other Landlord's Tenants**: Landlord A tries `list` on `/tenants` without `where('landlordUid', '==', uid)` -> `PERMISSION_DENIED`.
13. **Officer or Landlord Reading/Mutating Admin Credentials**: Police officer or landlord tries `getDoc(doc(db, 'admin_credentials', 'primary'))` or updating it -> `PERMISSION_DENIED`.

