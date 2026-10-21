// Volatile in-memory data store.
// Records exist only while this page is loaded. Refreshing the page clears
// user-added/edited records. No dashboard records are written to localStorage
// or Firestore.
export const db = { localOnly: true };

const listeners = new Set();
const defaultPlans = [
  { id: "weekly", name: "Weekly", duration: "7 Days", price: 150 },
  { id: "monthly", name: "Monthly", duration: "30 Days", price: 500 },
  { id: "yearly", name: "Yearly", duration: "365 Days", price: 5000 }
];

// This data lives only in JavaScript memory and resets on a full page refresh.
const store = new Map([["membershipPlans", defaultPlans.map((plan) => ({ ...plan }))]]);

const read = (name) => (store.get(name) || []).map((item) => ({ ...item }));
const write = (name, value) => {
  store.set(name, value.map((item) => ({ ...item })));
  listeners.forEach((fn) => fn(name));
};

export const collection = (_db, name) => ({ type: "collection", name });
export const doc = (_db, name, id) => ({ type: "doc", name, id: String(id) });
export const serverTimestamp = () => new Date().toISOString();
export const where = (field, op, value) => ({ type: "where", field, op, value });
export const orderBy = (field, direction = "asc") => ({ type: "orderBy", field, direction });
export const query = (ref, ...constraints) => ({ ...ref, constraints });

const matches = (item, c) => {
  if (c.type !== "where") return true;
  if (c.op === "==") return item[c.field] === c.value;
  if (c.op === "!=") return item[c.field] !== c.value;
  if (c.op === "in") return Array.isArray(c.value) && c.value.includes(item[c.field]);
  return true;
};

const filtered = (ref) => {
  const constraints = ref.constraints || [];
  const rows = read(ref.name).filter((item) =>
    constraints.filter((c) => c.type === "where").every((c) => matches(item, c))
  );
  const sort = constraints.find((c) => c.type === "orderBy");
  if (sort) {
    rows.sort((a, b) =>
      (a[sort.field] > b[sort.field] ? 1 : a[sort.field] < b[sort.field] ? -1 : 0) *
      (sort.direction === "desc" ? -1 : 1)
    );
  }
  return rows;
};

const snap = (rows) => ({
  docs: rows.map((data) => ({
    id: data.id,
    data: () => ({ ...data }),
    exists: () => true
  })),
  empty: rows.length === 0,
  size: rows.length,
  forEach: (fn) => rows.forEach((data) => fn({
    id: data.id,
    data: () => ({ ...data })
  }))
});

export async function getDocs(ref) {
  return snap(filtered(ref));
}

export async function addDoc(ref, data) {
  const rows = read(ref.name);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  rows.push({ ...data, id });
  write(ref.name, rows);
  return { id, path: `${ref.name}/${id}` };
}

export async function setDoc(ref, data, options = {}) {
  const rows = read(ref.name);
  const index = rows.findIndex((item) => item.id === ref.id);
  if (index >= 0) {
    rows[index] = options.merge
      ? { ...rows[index], ...data, id: ref.id }
      : { ...data, id: ref.id };
  } else {
    rows.push({ ...data, id: ref.id });
  }
  write(ref.name, rows);
}

export async function updateDoc(ref, data) {
  const rows = read(ref.name);
  const index = rows.findIndex((item) => item.id === ref.id);
  if (index < 0) throw new Error(`Record ${ref.name}/${ref.id} not found`);
  rows[index] = { ...rows[index], ...data, id: ref.id };
  write(ref.name, rows);
}

export async function deleteDoc(ref) {
  write(ref.name, read(ref.name).filter((item) => item.id !== ref.id));
}

export function onSnapshot(ref, callback, onError) {
  const refresh = (name) => {
    if (name === ref.name) {
      try {
        callback(snap(filtered(ref)));
      } catch (error) {
        onError?.(error);
      }
    }
  };
  listeners.add(refresh);
  Promise.resolve().then(() => refresh(ref.name));
  return () => listeners.delete(refresh);
}

export async function getDoc(ref) {
  const data = read(ref.name).find((item) => item.id === ref.id);
  return {
    id: ref.id,
    exists: () => !!data,
    data: () => data ? ({ ...data }) : undefined
  };
}
