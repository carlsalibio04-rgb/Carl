import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "../lib/memoryDb.js";

import { db } from "../lib/memoryDb.js";

const DEFAULT_PLANS = [
    { id: "weekly", name: "Weekly", duration: "7 Days", price: 150 },
    { id: "monthly", name: "Monthly", duration: "30 Days", price: 500 },
    { id: "yearly", name: "Yearly", duration: "365 Days", price: 5000 }
];

const daysFromDuration = (duration) => parseInt(String(duration || "0"), 10) || 0;

export default function AdminDashboard({ user, onLogout }) {
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [plans, setPlans] = useState([]);
    const [extensionRequests, setExtensionRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("All");
    const [planFilter, setPlanFilter] = useState("All");
    const [memberSearch, setMemberSearch] = useState("");
    const [sendingNotification, setSendingNotification] = useState(null);
    const [now, setNow] = useState(new Date());

    const [editingPayment, setEditingPayment] = useState(null);
    const [savingPayment, setSavingPayment] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const loadPayments = async () => {
        try {
            setLoading(true);
            const paymentsQuery = query(
                collection(db, "payments"),
                orderBy("createdAt", "desc")
            );
            const snapshot = await getDocs(paymentsQuery);
            setPayments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        } catch (error) {
            console.error("Failed to load payments:", error);
            alert("Unable to load payment records: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const loadPlans = async () => {
        try {
            const snapshot = await getDocs(collection(db, "membershipPlans"));
            if (snapshot.empty) {
                await Promise.all(
                    DEFAULT_PLANS.map((plan) =>
                        setDoc(doc(db, "membershipPlans", plan.id), plan)
                    )
                );
                setPlans(DEFAULT_PLANS);
            } else {
                setPlans(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
            }
        } catch (error) {
            console.error("Failed to load plans:", error);
            alert("Unable to load membership prices: " + error.message);
        }
    };

    useEffect(() => {
        loadPayments();
        loadPlans();

        const requestsQuery = query(
            collection(db, "extensionRequests"),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(
            requestsQuery,
            (snapshot) => {
                setExtensionRequests(
                    snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
                );
            },
            (error) => console.error("Extension request error:", error)
        );

        return () => unsubscribe();
    }, []);

    const addActivity = async (action, payment, details) => {
        await addDoc(collection(db, "activityLogs"), {
            action,
            paymentId: payment?.id || null,
            memberUid: payment?.uid || null,
            memberName: payment?.name || "",
            details,
            adminUid: user.uid,
            createdAt: serverTimestamp()
        });
    };

    const approvePayment = async (payment) => {
        try {
            const startDate = new Date();
            const expirationDate = new Date(startDate);
            const days = daysFromDuration(payment.duration);
            expirationDate.setDate(expirationDate.getDate() + days);

            await updateDoc(doc(db, "payments", payment.id), {
                status: "Approved",
                startDate: startDate.toISOString(),
                expirationDate: expirationDate.toISOString()
            });
            await addActivity("Payment Approved", payment, `${payment.plan} payment approved for ₱${payment.amount}.`);
            alert("Payment approved successfully!");
            loadPayments();
        } catch (error) {
            console.error("Approval error:", error);
            alert("Unable to approve payment: " + error.message);
        }
    };

    const deletePayment = async (payment) => {
        const confirmed = window.confirm(
            `Delete the payment record for ${payment.name || payment.email}? This cannot be undone.`
        );
        if (!confirmed) return;

        try {
            await deleteDoc(doc(db, "payments", payment.id));
            await addActivity("Payment Deleted", payment, `Payment record deleted (${payment.plan}, ₱${payment.amount}).`);
            alert("Payment record deleted.");
            loadPayments();
        } catch (error) {
            console.error("Delete error:", error);
            alert("Unable to delete payment: " + error.message);
        }
    };

    const sendExpirationReminder = async (payment) => {
        if (!payment.uid) {
            alert("This payment does not have a member UID.");
            return;
        }

        try {
            setSendingNotification(payment.id);
            await addDoc(collection(db, "notifications"), {
                uid: payment.uid,
                title: "Membership Reminder",
                message: `Your ${payment.plan} membership will expire on ${formatDate(payment.expirationDate)}. Please renew if you want to continue training.`,
                type: "expiration",
                paymentId: payment.id,
                createdAt: serverTimestamp()
            });
            alert(`Reminder sent to ${payment.name || payment.email}.`);
        } catch (error) {
            console.error("Notification error:", error);
            alert("Unable to send notification: " + error.message);
        } finally {
            setSendingNotification(null);
        }
    };

    const openEditPayment = (payment) => {
        setEditingPayment({
            ...payment,
            amount: Number(payment.amount || 0),
            status: payment.status || "Pending",
            expirationDate: payment.expirationDate
                ? new Date(payment.expirationDate).toISOString().slice(0, 10)
                : ""
        });
    };

    const savePaymentEdit = async () => {
        if (!editingPayment) return;

        try {
            setSavingPayment(true);
            const selectedPlan = plans.find((plan) => plan.name === editingPayment.plan);
            const updates = {
                name: editingPayment.name,
                plan: editingPayment.plan,
                amount: Number(editingPayment.amount) || 0,
                duration: selectedPlan?.duration || editingPayment.duration,
                paymentMethod: editingPayment.paymentMethod,
                status: editingPayment.status
            };

            if (editingPayment.status === "Approved") {
                const existingExpiration = editingPayment.expirationDate
                    ? new Date(editingPayment.expirationDate)
                    : null;
                const expiration = existingExpiration || new Date();
                if (!existingExpiration) {
                    expiration.setDate(expiration.getDate() + daysFromDuration(updates.duration));
                }
                updates.expirationDate = expiration.toISOString();
                updates.startDate = editingPayment.startDate || new Date().toISOString();
            } else if (editingPayment.status !== "Approved") {
                updates.expirationDate = null;
            }

            await updateDoc(doc(db, "payments", editingPayment.id), updates);
            await addActivity("Payment Edited", editingPayment, `Payment record updated to ${updates.plan}, ₱${updates.amount}, ${updates.status}.`);
            setEditingPayment(null);
            alert("Payment record updated successfully!");
            loadPayments();
        } catch (error) {
            console.error("Edit payment error:", error);
            alert("Unable to update payment: " + error.message);
        } finally {
            setSavingPayment(false);
        }
    };

    const approveExtension = async (request) => {
        if (request.status !== "Pending") return;
        const payment = payments.find((item) => item.id === request.paymentId);
        if (!payment) {
            alert("The original payment record could not be found.");
            return;
        }

        try {
            const currentExpiration = payment.expirationDate
                ? new Date(payment.expirationDate)
                : new Date();
            const newExpiration = new Date(currentExpiration);
            newExpiration.setDate(newExpiration.getDate() + Number(request.days || 0));

            await updateDoc(doc(db, "payments", payment.id), {
                expirationDate: newExpiration.toISOString()
            });
            await updateDoc(doc(db, "extensionRequests", request.id), {
                status: "Approved",
                reviewedAt: new Date().toISOString(),
                reviewedBy: user.uid
            });
            await addDoc(collection(db, "notifications"), {
                uid: request.uid,
                title: "Extension Approved",
                message: `Your membership extension of ${request.days} day(s) was approved. Your new expiration date is ${newExpiration.toLocaleDateString()}.`,
                type: "extension",
                paymentId: payment.id,
                createdAt: serverTimestamp()
            });
            await addActivity("Membership Extended", payment, `Membership extended by ${request.days} day(s).`);
            alert("Membership extension approved.");
            loadPayments();
        } catch (error) {
            console.error("Extension approval error:", error);
            alert("Unable to approve extension: " + error.message);
        }
    };

    const rejectExtension = async (request) => {
        try {
            await updateDoc(doc(db, "extensionRequests", request.id), {
                status: "Rejected",
                reviewedAt: new Date().toISOString(),
                reviewedBy: user.uid
            });
            await addDoc(collection(db, "notifications"), {
                uid: request.uid,
                title: "Extension Request Rejected",
                message: "Your membership extension request was not approved. Please contact the gym if you have questions.",
                type: "extension",
                createdAt: serverTimestamp()
            });
            alert("Extension request rejected.");
        } catch (error) {
            console.error("Extension rejection error:", error);
            alert("Unable to reject extension: " + error.message);
        }
    };

    const totalPayments = payments
        .filter((payment) => payment.status !== "Cancelled")
        .reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const pendingPayments = payments.filter((payment) => payment.status === "Pending").length;
    const approvedPayments = payments.filter((payment) => payment.status === "Approved").length;
    const expiredMemberships = payments.filter((payment) =>
        payment.status === "Approved" && payment.expirationDate && new Date(payment.expirationDate).getTime() <= now.getTime()
    ).length;
    const activeMembers = new Set(
        payments
            .filter((payment) => payment.status === "Approved" && payment.expirationDate && new Date(payment.expirationDate).getTime() > now.getTime())
            .map((payment) => payment.uid)
            .filter(Boolean)
    ).size;

    const filteredPayments = useMemo(() => payments.filter((payment) => {
        const search = memberSearch.trim().toLowerCase();
        const matchesStatus = statusFilter === "All" || payment.status === statusFilter;
        const matchesPlan = planFilter === "All" || payment.plan === planFilter;
        const matchesMember = !search || [payment.name, payment.email, payment.uid, payment.plan]
            .some((value) => String(value || "").toLowerCase().includes(search));
        return matchesStatus && matchesPlan && matchesMember;
    }), [payments, memberSearch, statusFilter, planFilter]);

    const pendingExtensionRequests = extensionRequests.filter((request) => request.status === "Pending");

    const getCountdown = (expirationDate) => {
        if (!expirationDate) return null;
        const difference = new Date(expirationDate).getTime() - now.getTime();
        if (difference <= 0) return { expired: true, text: "Expired" };
        const totalSeconds = Math.floor(difference / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return { expired: false, text: `${days}d ${hours}h ${minutes}m ${seconds}s` };
    };

    return (
        <div className="bg-light min-vh-100">
            <nav className="navbar navbar-dark bg-dark shadow-sm">
                <div className="container">
                    <div>
                        <span className="navbar-brand fw-bold">MOMENTUM GYM</span>
                        <span className="badge text-bg-danger ms-2">ADMIN</span>
                    </div>
                    <div className="d-flex gap-2">
                        <button className="btn btn-outline-warning btn-sm" onClick={() => navigate("/edit-price")}>Edit Price</button>
                        <button className="btn btn-outline-info btn-sm" onClick={() => navigate("/frontdesk")}>Front Desk</button>
                        <button className="btn btn-outline-light btn-sm" onClick={onLogout}>Logout</button>
                    </div>
                </div>
            </nav>

            <main className="container py-4 py-lg-5">
                <div className="mb-4">
                    <h1 className="fw-bold mb-1">Admin Dashboard</h1>
                    <p className="text-secondary mb-0">Signed in as {user?.email}</p>
                </div>

                <div className="row g-3 mb-4">
                    {[
                        ["Revenue", `₱${totalPayments}`, "text-danger"],
                        ["Active Members", activeMembers, "text-success"],
                        ["Pending Payments", pendingPayments, ""],
                        ["Expired", expiredMemberships, "text-warning"]
                    ].map(([label, value, color]) => (
                        <div className="col-sm-6 col-lg-3" key={label}>
                            <div className="card border-0 shadow-sm h-100"><div className="card-body">
                                <span className="text-secondary small">{label.toUpperCase()}</span>
                                <div className={`display-6 fw-bold mt-2 ${color}`}>{value}</div>
                            </div></div>
                        </div>
                    ))}
                </div>

                {pendingPayments > 0 && (
                    <div className="alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-3 shadow-sm">
                        <div><strong>Admin Notification: {pendingPayments} pending payment{pendingPayments === 1 ? "" : "s"}</strong><div className="small">Review pending payments.</div></div>
                        <button className="btn btn-sm btn-dark" onClick={() => setStatusFilter("Pending")}>View Pending</button>
                    </div>
                )}

                {pendingExtensionRequests.length > 0 && (
                    <section className="card border-0 shadow-sm mb-4">
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h2 className="h5 fw-bold mb-0">Extension Requests</h2>
                                <span className="badge text-bg-danger">{pendingExtensionRequests.length} pending</span>
                            </div>
                            <div className="table-responsive">
                                <table className="table align-middle mb-0">
                                    <thead><tr><th>Member</th><th>Days</th><th>Reason</th><th>Action</th></tr></thead>
                                    <tbody>
                                        {pendingExtensionRequests.map((request) => (
                                            <tr key={request.id}>
                                                <td><strong>{request.name || request.email}</strong><small className="d-block text-secondary">{request.email}</small></td>
                                                <td>+{request.days} days</td>
                                                <td>{request.reason || "—"}</td>
                                                <td><div className="d-flex gap-2"><button className="btn btn-sm btn-success" onClick={() => approveExtension(request)}>Approve</button><button className="btn btn-sm btn-outline-danger" onClick={() => rejectExtension(request)}>Reject</button></div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}

                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                    <div><span className="text-danger fw-bold small">MANAGEMENT</span><h2 className="h3 fw-bold mt-1 mb-0">Payment Records</h2></div>
                    <div className="d-flex flex-wrap gap-2">
                        <input type="search" className="form-control" placeholder="Search member..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} style={{ minWidth: "220px" }} />
                        <select className="form-select w-auto" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                            <option value="All">All Plans</option>
                            {plans.map((plan) => <option key={plan.id} value={plan.name}>{plan.name}</option>)}
                        </select>
                        <select className="form-select w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="All">All Status</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>

                {loading ? <div className="text-center py-5"><div className="spinner-border text-danger" /><p className="text-secondary mt-3">Loading payment records...</p></div> : filteredPayments.length === 0 ? <div className="alert alert-secondary">No payment records found.</div> : (
                    <div className="table-responsive bg-white rounded shadow-sm">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-dark"><tr><th>Member</th><th>Plan</th><th>Amount</th><th>Method</th><th>Expiration</th><th>Countdown</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {filteredPayments.map((payment) => {
                                    const countdown = getCountdown(payment.expirationDate);
                                    return <tr key={payment.id}>
                                        <td><strong>{payment.name}</strong><small className="d-block text-secondary">{payment.email}</small></td>
                                        <td>{payment.plan}<small className="d-block text-secondary">{payment.duration}</small></td>
                                        <td>₱{payment.amount}</td>
                                        <td>{payment.paymentMethod || "—"}</td>
                                        <td>{formatDate(payment.expirationDate)}</td>
                                        <td>{payment.status === "Approved" && countdown ? <span className={`badge ${countdown.expired ? "text-bg-warning" : "text-bg-success"}`}>{countdown.text}</span> : <span className="text-secondary">—</span>}</td>
                                        <td><span className={`badge ${payment.status === "Approved" ? "text-bg-success" : payment.status === "Cancelled" ? "text-bg-secondary" : "text-bg-warning"}`}>{payment.status}</span></td>
                                        <td>
                                            <div className="d-flex flex-wrap gap-1">
                                                {payment.status === "Pending" && <button className="btn btn-sm btn-success" onClick={() => approvePayment(payment)}>Approve</button>}
                                                {payment.status === "Approved" && payment.expirationDate && <button className="btn btn-sm btn-outline-danger" onClick={() => sendExpirationReminder(payment)} disabled={sendingNotification === payment.id}>{sendingNotification === payment.id ? "Sending..." : "Notify"}</button>}
                                                <button className="btn btn-sm btn-outline-primary" onClick={() => openEditPayment(payment)}>Edit</button>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => deletePayment(payment)}>Delete</button>
                                            </div>
                                        </td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                <section className="card border-0 shadow-sm mt-4">
                    <div className="card-body">
                        <h2 className="h5 fw-bold">Recent Activity</h2>
                        <ActivityLog />
                    </div>
                </section>
            </main>

            {editingPayment && (
                <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,.55)" }}>
                    <div className="modal-dialog modal-lg modal-dialog-centered"><div className="modal-content">
                        <div className="modal-header"><h5 className="modal-title fw-bold">Edit Payment Record</h5><button className="btn-close" onClick={() => setEditingPayment(null)} /></div>
                        <div className="modal-body">
                            <div className="row g-3">
                                <div className="col-md-6"><label className="form-label">Member Name</label><input className="form-control" value={editingPayment.name || ""} onChange={(e) => setEditingPayment({ ...editingPayment, name: e.target.value })} /></div>
                                <div className="col-md-6"><label className="form-label">Email</label><input className="form-control" value={editingPayment.email || ""} disabled /></div>
                                <div className="col-md-4"><label className="form-label">Plan</label><select className="form-select" value={editingPayment.plan || ""} onChange={(e) => { const selected = plans.find((plan) => plan.name === e.target.value); setEditingPayment({ ...editingPayment, plan: e.target.value, amount: selected?.price ?? editingPayment.amount, duration: selected?.duration ?? editingPayment.duration }); }}>{plans.map((plan) => <option key={plan.id}>{plan.name}</option>)}</select></div>
                                <div className="col-md-4"><label className="form-label">Amount</label><input type="number" className="form-control" value={editingPayment.amount} onChange={(e) => setEditingPayment({ ...editingPayment, amount: e.target.value })} /></div>
                                <div className="col-md-4"><label className="form-label">Payment Method</label><select className="form-select" value={editingPayment.paymentMethod || "Cash"} onChange={(e) => setEditingPayment({ ...editingPayment, paymentMethod: e.target.value })}><option>Cash</option><option>GCash</option></select></div>
                                <div className="col-md-6"><label className="form-label">Status</label><select className="form-select" value={editingPayment.status} onChange={(e) => setEditingPayment({ ...editingPayment, status: e.target.value })}><option>Pending</option><option>Approved</option><option>Cancelled</option></select></div>
                                <div className="col-md-6"><label className="form-label">Expiration Date</label><input type="date" className="form-control" value={editingPayment.expirationDate || ""} onChange={(e) => setEditingPayment({ ...editingPayment, expirationDate: e.target.value })} disabled={editingPayment.status !== "Approved"} /></div>
                            </div>
                        </div>
                        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setEditingPayment(null)}>Cancel</button><button className="btn btn-danger" onClick={savePaymentEdit} disabled={savingPayment}>{savingPayment ? "Saving..." : "Save Payment"}</button></div>
                    </div></div>
                </div>
            )}
        </div>
    );
}

function ActivityLog() {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        const q = query(collection(db, "activityLogs"), orderBy("createdAt", "desc"));
        return onSnapshot(q, (snapshot) => setLogs(snapshot.docs.slice(0, 8).map((item) => ({ id: item.id, ...item.data() }))));
    }, []);

    if (logs.length === 0) return <p className="text-secondary mb-0">No activity recorded yet.</p>;
    return <div className="list-group list-group-flush">{logs.map((log) => <div className="list-group-item px-0" key={log.id}><strong>{log.action}</strong><div className="small text-secondary">{log.memberName || "Member"} · {log.details}</div></div>)}</div>;
}

function formatDate(value) {
    if (!value) return "—";
    const date = value?.toDate?.() || new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}
