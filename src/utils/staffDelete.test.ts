import assert from "node:assert/strict"
import {
  collectStaffDeleteIds,
  isSameStaffPerson,
  pickUniqueEmailMatch,
  relatedRowsForStaffDelete,
} from "./staffDelete.ts"

const ana = { id: "sec-ana", email: "ana@clinic.test", cpf: "52998224725" }
const brunoDoctor = {
  id: "doc-bruno",
  user_id: "auth-bruno",
  email: "bruno@clinic.test",
  cpf: "52998224725",
}
const anaProfile = { id: "sec-ana", email: "ana@clinic.test" }

assert.equal(isSameStaffPerson(ana, anaProfile), true)
assert.equal(isSameStaffPerson(ana, brunoDoctor), false, "shared CPF must not attach another doctor")
assert.equal(
  isSameStaffPerson({ id: "auth-bruno" }, brunoDoctor),
  true,
  "auth uid on doctors.user_id still matches",
)

const pollutedDoctorQuery = [
  { id: "sec-ana", email: "ana@clinic.test", cpf: "52998224725" },
  brunoDoctor,
]
const related = relatedRowsForStaffDelete(ana, pollutedDoctorQuery, [anaProfile])
assert.deepEqual(
  related.map((row) => row.id),
  ["sec-ana"],
  "OR(email,cpf) extra hits must be dropped before delete-user",
)
assert.deepEqual(collectStaffDeleteIds(ana, related), ["sec-ana"])

const uniqueProfile = pickUniqueEmailMatch("bruno@clinic.test", [
  { id: "auth-bruno", email: "bruno@clinic.test" },
])
assert.equal(uniqueProfile?.id, "auth-bruno")

const collidingInbox = pickUniqueEmailMatch("shared@clinic.test", [
  { id: "profile-a", email: "shared@clinic.test" },
  { id: "profile-b", email: "shared@clinic.test" },
])
assert.equal(collidingInbox, null, "shared inbox must not be adopted")

const doctorWithDistinctPk = {
  id: "doc-pk",
  user_id: "auth-carla",
  email: "carla@clinic.test",
}
const carla = { id: "doc-pk", email: "carla@clinic.test" }
const carlaRelated = relatedRowsForStaffDelete(
  carla,
  [doctorWithDistinctPk],
  [],
  { id: "auth-carla", email: "carla@clinic.test" },
)
assert.deepEqual(collectStaffDeleteIds(carla, carlaRelated).sort(), ["auth-carla", "doc-pk"])

console.log("staffDelete tests passed")
