import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, db } from "../lib/memoryDb.js";
const plans = [
    { name: "Weekly", duration: "7 Days", price: "150" },
    { name: "Monthly", duration: "30 Days", price: "500" },
    { name: "Yearly", duration: "365 Days", price: "5000" }
];

export default function FrontDesk() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [memberName, setMemberName] = useState("");
    const [email, setEmail] = useState("");
    const [plan, setPlan] = useState("Weekly");
    const [amount, setAmount] = useState("150");
    const [status, setStatus] = useState("Approved");
    const [showAdd, setShowAdd] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [editID, setEditID] = useState(null);
    const [editMemberName, setEditMemberName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editPlan, setEditPlan] = useState("Weekly");
    const [editAmount, setEditAmount] = useState("150");
    const [editStatus, setEditStatus] = useState("Approved");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getDocs(collection(db, "frontdesk"))
            .then((snapshot) => setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
            .catch((error) => console.error("Front desk load error:", error));
    }, []);

    function changePlan(value, editing = false) {
        const selected = plans.find((item) => item.name === value);
        if (editing) {
            setEditPlan(value);
            setEditAmount(selected ? selected.price : "");
        } else {
            setPlan(value);
            setAmount(selected ? selected.price : "");
        }
    }

    async function formAdd(e) {
        e.preventDefault();
        if (!memberName.trim() || !email.trim() || !plan || amount === "") return alert("Please complete all fields.");
        try {
            setSaving(true);
            const record = { memberName: memberName.trim(), email: email.trim(), plan, amount, paymentMethod: "Cash", status, createdAt: new Date().toISOString() };
            const ref = await addDoc(collection(db, "frontdesk"), record);
            setItems((oldItems) => [...oldItems, { ...record, id: ref.id }]);
            setMemberName(""); setEmail(""); setPlan("Weekly"); setAmount("150"); setStatus("Approved"); setShowAdd(false);
        } catch (error) { console.log("POST error:", error); alert(error.message); }
        finally { setSaving(false); }
    }

    function openEditModal(item) {
        setEditID(item.id); setEditMemberName(item.memberName); setEditEmail(item.email); setEditPlan(item.plan); setEditAmount(item.amount); setEditStatus(item.status); setShowEdit(true);
    }

    async function formEdit(e) {
        e.preventDefault();
        try {
            setSaving(true);
            const data = { memberName: editMemberName.trim(), email: editEmail.trim(), plan: editPlan, amount: editAmount, paymentMethod: "Cash", status: editStatus };
            await updateDoc(doc(db, "frontdesk", editID), data);
            setItems((oldItems) => oldItems.map((item) => item.id === editID ? { ...item, ...data } : item));
            setShowEdit(false); setEditID(null);
        } catch (error) { console.log("PUT error:", error); alert(error.message); }
        finally { setSaving(false); }
    }

    async function handleDelete(id) {
        if (!window.confirm("Are you sure you want to delete this record?")) return;
        try {
            await deleteDoc(doc(db, "frontdesk", id));
            setItems((oldItems) => oldItems.filter((item) => item.id !== id));
        } catch (error) { console.log("Delete error:", error); alert(error.message); }
    }

    function memberForm(isEdit) {
        const currentName = isEdit ? editMemberName : memberName;
        const setCurrentName = isEdit ? setEditMemberName : setMemberName;
        const currentEmail = isEdit ? editEmail : email;
        const setCurrentEmail = isEdit ? setEditEmail : setEmail;
        const currentPlan = isEdit ? editPlan : plan;
        const currentAmount = isEdit ? editAmount : amount;
        const currentStatus = isEdit ? editStatus : status;
        const setCurrentStatus = isEdit ? setEditStatus : setStatus;
        return <><div className="mb-3"><label className="form-label fw-semibold">Member Name</label><input className="form-control" value={currentName} onChange={(e) => setCurrentName(e.target.value)} required /></div><div className="mb-3"><label className="form-label fw-semibold">Email</label><input type="email" className="form-control" value={currentEmail} onChange={(e) => setCurrentEmail(e.target.value)} required /></div><div className="mb-3"><label className="form-label fw-semibold">Plan</label><select className="form-select" value={currentPlan} onChange={(e) => changePlan(e.target.value, isEdit)}>{plans.map((item) => <option key={item.name} value={item.name}>{item.name} - {item.duration}</option>)}</select></div><div className="mb-3"><label className="form-label fw-semibold">Amount</label><div className="input-group"><span className="input-group-text">₱</span><input type="number" min="0" className="form-control" value={currentAmount} onChange={(e) => isEdit ? setEditAmount(e.target.value) : setAmount(e.target.value)} required /></div></div><div className="mb-3"><label className="form-label fw-semibold">Payment Method</label><input className="form-control" value="Cash" disabled /></div><div className="mb-3"><label className="form-label fw-semibold">Status</label><select className="form-select" value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)}><option>Approved</option><option>Pending</option><option>Cancelled</option></select></div></>;
    }

    return <div className="bg-light min-vh-100"><nav className="navbar navbar-dark bg-dark shadow-sm"><div className="container"><span className="navbar-brand fw-bold">MOMENTUM GYM</span><button className="btn btn-outline-light btn-sm" onClick={() => navigate("/admin")}>← Back to Admin</button></div></nav><main className="container py-5"><div className="d-flex justify-content-between align-items-center mb-4"><div><span className="text-danger fw-bold">FRONT DESK</span><h1 className="fw-bold mb-1">Front Desk Members</h1><p className="text-secondary mb-0">Manage walk-in members and cash payments.</p></div><button className="btn btn-danger" onClick={() => setShowAdd(true)}><b>+ Add Member</b></button></div><div className="card border-0 shadow-sm"><div className="table-responsive"><table className="table table-hover align-middle mb-0"><thead className="table-dark"><tr><th>ID</th><th>Member</th><th>Email</th><th>Plan</th><th>Amount</th><th>Payment</th><th>Status</th><th className="text-center">Action</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan="8" className="text-center text-secondary py-5">No front desk members yet.</td></tr> : items.map((item, index) => <tr key={item.id || index}><td>{item.id}</td><td className="fw-semibold">{item.memberName}</td><td>{item.email}</td><td>{item.plan}</td><td>₱{item.amount}</td><td>{item.paymentMethod}</td><td><span className={`badge ${item.status === "Approved" ? "text-bg-success" : item.status === "Pending" ? "text-bg-warning" : "text-bg-danger"}`}>{item.status}</span></td><td><div className="d-flex justify-content-center gap-2"><button className="btn btn-sm btn-outline-primary" onClick={() => openEditModal(item)}>Edit</button><button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(item.id)}>Delete</button></div></td></tr>)}</tbody></table></div></div></main>
        {showAdd && <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,.55)" }}><div className="modal-dialog modal-dialog-centered"><div className="modal-content"><form onSubmit={formAdd}><div className="modal-header"><h5 className="modal-title fw-bold">Add Member</h5><button type="button" className="btn-close" onClick={() => setShowAdd(false)} /></div><div className="modal-body">{memberForm(false)}</div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-danger" disabled={saving}>{saving ? "Saving..." : "Add Member"}</button></div></form></div></div></div>}
        {showEdit && <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,.55)" }}><div className="modal-dialog modal-dialog-centered"><div className="modal-content"><form onSubmit={formEdit}><div className="modal-header"><h5 className="modal-title fw-bold">Edit Member</h5><button type="button" className="btn-close" onClick={() => setShowEdit(false)} /></div><div className="modal-body">{memberForm(true)}</div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button></div></form></div></div></div>}
    </div>;
}