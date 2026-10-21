import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const VALID_ROLES = ["admin", "member", "frontdesk"];

export async function ensureUserDoc(user, name = "") {
  if (!user?.uid) throw new Error("Hindi makuha ang user ID.");
  const ref = doc(db, "users", user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const old = existing.data();
    // Only change the name if needed; role remains controlled from Firestore.
    const nextName = name || user.displayName || old.name || "";
    if (nextName !== (old.name || "")) await setDoc(ref, { name: nextName }, { merge: true });
  } else {
    await setDoc(ref, {
      name: name || user.displayName || "",
      email: user.email || "",
      uid: user.uid,
      role: "member",
    });
  }
}

export async function getRole(user) {
  if (!user?.uid) return null;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await ensureUserDoc(user);
    return "member";
  }
  const role = snap.data()?.role;
  return VALID_ROLES.includes(role) ? role : "member";
}
