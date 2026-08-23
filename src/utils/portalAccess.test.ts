import assert from "node:assert/strict"
import {
  PORTAL_EMAIL_IN_USE,
  PORTAL_EMAIL_LINKED_TO_OTHER_PATIENT,
  decideDuplicatePortalEmail,
} from "./portalAccess.ts"

const ana = "patient-ana"
const anaAuth = "auth-ana"
const bruno = "patient-bruno"
const brunoAuth = "auth-bruno"

const adoptSameUserId = decideDuplicatePortalEmail({
  currentPatientId: ana,
  currentPatientUserId: anaAuth,
  existingProfileId: anaAuth,
  patientIdLinkedToProfile: ana,
})
assert.deepEqual(adoptSameUserId, { ok: true, userId: anaAuth })

const adoptLinkedRow = decideDuplicatePortalEmail({
  currentPatientId: ana,
  currentPatientUserId: "",
  existingProfileId: anaAuth,
  patientIdLinkedToProfile: ana,
})
assert.deepEqual(adoptLinkedRow, { ok: true, userId: anaAuth })

const otherPatient = decideDuplicatePortalEmail({
  currentPatientId: bruno,
  currentPatientUserId: "",
  existingProfileId: anaAuth,
  patientIdLinkedToProfile: ana,
})
assert.equal(otherPatient.ok, false)
assert.equal(!otherPatient.ok && otherPatient.message, PORTAL_EMAIL_LINKED_TO_OTHER_PATIENT)

const staffOrOrphan = decideDuplicatePortalEmail({
  currentPatientId: bruno,
  currentPatientUserId: "",
  existingProfileId: "auth-doctor-maria",
  patientIdLinkedToProfile: "",
})
assert.equal(staffOrOrphan.ok, false)
assert.equal(!staffOrOrphan.ok && staffOrOrphan.message, PORTAL_EMAIL_IN_USE)

const missingProfile = decideDuplicatePortalEmail({
  currentPatientId: bruno,
  currentPatientUserId: brunoAuth,
  existingProfileId: "",
  patientIdLinkedToProfile: "",
})
assert.equal(missingProfile.ok, false)
assert.equal(!missingProfile.ok && missingProfile.message, PORTAL_EMAIL_IN_USE)

console.log("portalAccess tests passed")
