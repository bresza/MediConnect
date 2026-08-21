import assert from "node:assert/strict"
import { findDoctorForUser, isOwnedByDoctor, ownDoctorIds } from "./doctorIdentity.ts"

const mariaA = { id: "doc-a", email: "maria.a@clinic.test", crm: "12345-SP" }
const mariaB = { id: "doc-b", email: "maria.b@clinic.test", crm: "67890-RJ" }
const doctors = [mariaA, mariaB]

const userB = {
  id: "auth-b",
  doctorId: "doc-b",
  name: "Maria Santos",
  email: "maria.b@clinic.test",
  crm: "67890-RJ",
}

assert.deepEqual(ownDoctorIds(userB), ["doc-b", "auth-b"])

assert.equal(isOwnedByDoctor({ doctorId: "doc-b" }, userB), true)
assert.equal(isOwnedByDoctor({ doctorId: "doc-a" }, userB), false)
assert.equal(isOwnedByDoctor({ doctorId: "auth-b" }, userB), true)

// Homonym must not attach the first Maria just because names match.
assert.equal(findDoctorForUser(doctors, { id: "auth-b" }), undefined)
assert.equal(findDoctorForUser(doctors, userB), mariaB)
assert.equal(findDoctorForUser(doctors, { id: "auth-b", email: "maria.b@clinic.test" }), mariaB)
assert.equal(findDoctorForUser(doctors, { id: "doc-a" }), mariaA)

// Empty CRM must not match every doctor missing CRM.
const noCrm = [
  { id: "doc-x", email: "x@clinic.test" },
  { id: "doc-y", email: "y@clinic.test" },
]
assert.equal(findDoctorForUser(noCrm, { id: "auth-z", crm: "" }), undefined)
assert.equal(findDoctorForUser(noCrm, { id: "auth-z" }), undefined)

// Duplicate CRM is ambiguous — do not guess.
const dupCrm = [
  { id: "doc-1", crm: "111" },
  { id: "doc-2", crm: "111" },
]
assert.equal(findDoctorForUser(dupCrm, { id: "auth-z", crm: "111" }), undefined)

console.log("doctorIdentity tests passed")
