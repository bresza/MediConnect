/**
 * Staff deletion must identify the target by primary key / auth uid only.
 * Matching on email or CPF is unsafe: clinics reuse QA CPFs, shared inboxes,
 * and family members can collide. An `or=(id,email,cpf)` filter would then
 * feed extra IDs into `delete-user` and DELETE the wrong doctor/profile.
 */

export interface StaffDeleteIdentity {
  id: string
  email?: string
  cpf?: string
}

export interface StaffDeleteRow {
  id?: string
  user_id?: string
  email?: string | null
  cpf?: string | null
}

function normalizeId(value?: string | null): string {
  return value?.trim() ?? ""
}

function normalizeEmail(value?: string | null): string {
  return value?.trim().toLowerCase() ?? ""
}

/** True only when the row is this person by PK or auth uid — never by email/CPF. */
export function isSameStaffPerson(member: StaffDeleteIdentity, row: StaffDeleteRow): boolean {
  const memberId = normalizeId(member.id)
  if (!memberId) return false
  return normalizeId(row.id) === memberId || normalizeId(row.user_id) === memberId
}

/**
 * Adopt an email lookup only when it is unambiguous.
 * Two profiles sharing an inbox must not be deleted together.
 */
export function pickUniqueEmailMatch<T extends { email?: string | null }>(
  email: string | undefined,
  rows: T[],
): T | null {
  const needle = normalizeEmail(email)
  if (!needle) return null
  const matches = rows.filter((row) => normalizeEmail(row.email) === needle)
  return matches.length === 1 ? matches[0] : null
}

export function relatedRowsForStaffDelete(
  member: StaffDeleteIdentity,
  doctorRows: StaffDeleteRow[],
  profileRows: StaffDeleteRow[],
  uniqueEmailProfile: StaffDeleteRow | null = null,
): StaffDeleteRow[] {
  const related: StaffDeleteRow[] = []
  const seen = new Set<string>()

  const add = (row: StaffDeleteRow | null | undefined) => {
    if (!row) return
    const key = `${normalizeId(row.id)}:${normalizeId(row.user_id)}`
    if (seen.has(key)) return
    seen.add(key)
    related.push(row)
  }

  for (const row of doctorRows) {
    if (isSameStaffPerson(member, row)) add(row)
  }
  for (const row of profileRows) {
    if (isSameStaffPerson(member, row)) add(row)
  }
  if (uniqueEmailProfile) add(uniqueEmailProfile)
  return related
}

export function collectStaffDeleteIds(
  member: StaffDeleteIdentity,
  relatedRows: StaffDeleteRow[],
): string[] {
  const ids: string[] = []
  const add = (value?: string | null) => {
    const id = normalizeId(value)
    if (id && !ids.includes(id)) ids.push(id)
  }
  add(member.id)
  for (const row of relatedRows) {
    add(row.id)
    add(row.user_id)
  }
  return ids
}

export function postgrestIdFilter(column: string, ids: string[]): string | null {
  const unique = ids.filter((id, index, all) => id && all.indexOf(id) === index)
  if (unique.length === 0) return null
  if (unique.length === 1) return `${column}=eq.${encodeURIComponent(unique[0])}`
  return `${column}=in.(${unique.map((id) => encodeURIComponent(id)).join(",")})`
}
