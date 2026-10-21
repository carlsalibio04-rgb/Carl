import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, doc, updateDoc, db } from "../lib/memoryDb.js";

export default function EditPrice() {
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [newPrice, setNewPrice] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getDocs(collection(db, "membershipPlans"))
            .then((snapshot) => {
                const found = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
                setPlans(found.length ? found : [
                    { id: "weekly", name: "Weekly", duration: "7 Days", price: 150 },
                    { id: "monthly", name: "Monthly", duration: "30 Days", price: 500 },
                    { id: "yearly", name: "Yearly", duration: "365 Days", price: 5000 }
                ]);
            })
            .catch((error) => console.error("Plans load error:", error))
            .finally(() => setLoading(false));
    }, []);

    function openEdit(plan) {
        setSelectedPlan(plan);
        setNewPrice(String(plan.price));
    }

    async function savePrice() {
        const price = Number(newPrice);
        if (!Number.isFinite(price) || price < 0) {
            alert("Please enter a valid price.");
            return;
        }

        try {
            setSaving(true);
            await updateDoc(doc(db, "membershipPlans", selectedPlan.id), { price });
            setPlans((oldPlans) => oldPlans.map((plan) => plan.id === selectedPlan.id ? { ...plan, price } : plan));
            setSelectedPlan(null);
        } catch (error) {
            console.log("Price update error:", error);
            alert(error.message);

        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="bg-light min-vh-100">
            <nav className="navbar navbar-dark bg-dark shadow-sm"><div className="container"><span className="navbar-brand fw-bold">MOMENTUM GYM</span><button className="btn btn-outline-light btn-sm" onClick={() => navigate("/admin")}>← Back to Admin</button></div></nav>
            <main className="container py-5">
                <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><span className="text-danger fw-bold">PLANS</span><h1 className="fw-bold mb-1">Membership Plans</h1></div><p className="text-secondary mb-1">Manage membership prices.</p></div>
                {loading ? <div className="text-center py-5"><div className="spinner-border text-danger" /></div> : <div className="row g-4">{plans.map((plan) => <div className="col-md-6 col-lg-4" key={plan.id}><div className="card border-0 shadow-sm h-100"><div className="card-body p-4 p-lg-5"><span className="text-danger fw-bold">MEMBERSHIP</span><h2 className="h3 fw-bold mt-3">{plan.name}</h2><p className="text-secondary">Duration: {plan.duration}</p><div className="display-6 fw-bold mb-4">₱{Number(plan.price || 0).toLocaleString()}</div><button className="btn btn-danger w-100" onClick={() => openEdit(plan)}>Edit Price</button></div></div></div>)}</div>}
            </main>
            {selectedPlan && <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,.55)" }}><div className="modal-dialog modal-dialog-centered"><div className="modal-content"><div className="modal-header"><div><h5 className="modal-title fw-bold">Edit {selectedPlan.name} Price</h5><small className="text-secondary">{selectedPlan.duration}</small></div><button className="btn-close" onClick={() => setSelectedPlan(null)} /></div><div className="modal-body"><label className="form-label fw-semibold">New Price</label><div className="input-group"><span className="input-group-text">₱</span><input type="number" min="0" className="form-control" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} /></div></div><div className="modal-footer"><button className="btn btn-outline-secondary" onClick={() => setSelectedPlan(null)}>Cancel</button><button className="btn btn-danger" onClick={savePrice} disabled={saving}>{saving ? "Saving..." : "Save Price"}</button></div></div></div></div>}
        </div>
    );
}