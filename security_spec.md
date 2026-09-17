# Security Specification — Meu Posto 2.0

## 1. Data Invariants
1. A post operational record (funcionario, escala, fechamento, tanque, etc.) cannot exist without belonging to a valid `postoId`.
2. Users can only access records from the `postoId` they belong to, unless they are MASTER or the bootstrapped admin (`ubirajaraaux@gmail.com`).
3. Audit log records (`/postos/{postoId}/auditoria/{id}`) are completely immutable: `update` and `delete` are strictly disallowed.
4. User role elevation: Users cannot escalate their own role from OPERADOR/SUPERVISOR to MASTER.
5. User profile isolation: Users can read their own profile (`/usuarios/{uid}`).
6. Fechamentos and Ocorrências cannot be deleted by standard users.

## 2. Dirty Dozen Payloads (Targeting Exploits)
1. **Ghost Field in Funcionario**: Injecting `isOwner: true` into a funcionario update. (Blocked by schema validation / keys check).
2. **Posto ID Spoofing**: Attempting to write into `/postos/posto-02/` as a user assigned to `posto-matriz-01`. (Blocked by tenant boundary check).
3. **Audit Log Tampering**: Attempting to UPDATE or DELETE an existing audit log entry. (Blocked by `allow update, delete: if false`).
4. **Self-Role Escalation**: Regular operator attempting to change `/usuarios/{uid}` role to `MASTER`. (Blocked by role checks).
5. **Path ID Poisoning**: Supplying a 2KB junk character string as `{funcionarioId}`. (Blocked by `isValidId()`).
6. **Unauthenticated Read**: Requesting `/postos/{postoId}/fechamentos` without valid auth token. (Blocked by `isSignedIn()`).
7. **Unauthenticated Write**: Creating a `/postos/{postoId}/funcionarios` without authentication. (Blocked by `isSignedIn()`).
8. **Negative Volume/Afericao Poisoning**: Writing corrupted string types to numeric measurement fields. (Blocked by type validation).
9. **Cross-Tenant Fechamento Mutation**: Supervisor from Posto A approving fechamentos from Posto B. (Blocked by tenant check).
10. **Shadow Field in Ocorrencia**: Attaching unauthorized fields like `forgivenDebt: true`. (Blocked by affected keys).
11. **Spoofed Email Admin**: Logging in with unverified email attempting admin bypass. (Blocked by token checks).
12. **Blanket Collection Scrape**: Unfiltered collection queries without posto context. (Blocked by path scoping).
