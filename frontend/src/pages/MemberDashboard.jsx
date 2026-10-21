import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    addDoc,
    collection,
    getDocs,
    query,
    where,
    doc,
    updateDoc,
    onSnapshot,
    serverTimestamp
} from "../lib/memoryDb.js";

import { db } from "../lib/memoryDb.js";

export default function MemberDashboard({ user, onLogout }) {
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [payments, setPayments] = useState([]);
    const [activeMembership, setActiveMembership] = useState(null);
    const [pendingPayment, setPendingPayment] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [cancellingPayment, setCancellingPayment] = useState(false);
    const [extensionDays, setExtensionDays] = useState(7);
    const [extensionReason, setExtensionReason] = useState("");
    const [requestingExtension, setRequestingExtension] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const loadPlans = async () => {
            try {
                setLoading(true);
                setError("");
                const snapshot = await getDocs(collection(db, "membershipPlans"));
                const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
                setPlans(data);
            } catch (error) {
                console.error("PLAN ERROR:", error);
                setError("Unable to load membership plans. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        loadPlans();
    }, []);

    useEffect(() => {
        if (!user) return;

        const notificationsQuery = query(
            collection(db, "notifications"),
            where("uid", "==", user.uid)
        );

        const unsubscribe = onSnapshot(
            notificationsQuery,
            (snapshot) => {
                const data = snapshot.docs.map((document) => ({
                    id: document.id,
                    ...document.data()
                }));

                data.sort((a, b) => {
                    const aTime = a.createdAt?.toMillis?.() || 0;
                    const bTime = b.createdAt?.toMillis?.() || 0;
                    return bTime - aTime;
                });

                setNotifications(data);
            },
            (error) => {
                console.error("NOTIFICATION ERROR:", error);
            }
        );

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        const loadPayments = async () => {
            if (!user) return;

            try {
                const q = query(
                    collection(db, "payments"),
                    where("uid", "==", user.uid)
                );

                const snapshot = await getDocs(q);
                const data = snapshot.docs.map((document) => ({
                    id: document.id,
                    ...document.data()
                }));

                data.sort((a, b) => {
                    const aTime = a.createdAt?.toMillis?.() || 0;
                    const bTime = b.createdAt?.toMillis?.() || 0;
                    return bTime - aTime;
                });

                setPayments(data);

                const pending = data.find((payment) => payment.status === "Pending");
                setPendingPayment(pending || null);

                const approved = data.filter((payment) => payment.status === "Approved");

                if (approved.length > 0) {
                    const latest = approved[0];

                    if (latest.expirationDate) {
                        const expirationDate = new Date(latest.expirationDate);
                        setActiveMembership(
                            expirationDate >= new Date()
                                ? latest
                                : { ...latest, membershipStatus: "Expired" }
                        );
                    } else {
                        setActiveMembership(latest);
                    }
                } else {
                    setActiveMembership(null);
                }
            } catch (error) {
                console.error("PAYMENT HISTORY ERROR:", error);
            }
        };

        loadPayments();
    }, [user]);

    const getCountdown = (expirationDate) => {
        if (!expirationDate) return null;

        const end = new Date(expirationDate).getTime();
        const difference = end - now.getTime();

        if (difference <= 0) {
            return { expired: true, text: "Expired" };
        }

        const totalSeconds = Math.floor(difference / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return {
            expired: false,
            days,
            hours,
            minutes,
            seconds,
            text: `${days}d ${hours}h ${minutes}m ${seconds}s`
        };
    };

    const countdown = activeMembership?.expirationDate
        ? getCountdown(activeMembership.expirationDate)
        : null;

    const membershipIsExpired = countdown?.expired || activeMembership?.membershipStatus === "Expired";
    const requestExtension = async () => {
        if (!activeMembership || membershipIsExpired) {
            alert("You need an active membership to request an extension.");
            return;
        }

        if (Number(extensionDays) < 1) {
            alert("Please enter at least 1 day.");
            return;
        }

        try {
            setRequestingExtension(true);
            await addDoc(collection(db, "extensionRequests"), {
                uid: user.uid,
                name: user.displayName || user.email,
                email: user.email,
                paymentId: activeMembership.id,
                days: Number(extensionDays),
                reason: extensionReason.trim() || "Member requested an extension.",
                status: "Pending",
                createdAt: serverTimestamp()
            });
            setExtensionReason("");
            alert("Extension request sent to the admin.");
        } catch (error) {
            console.error("EXTENSION REQUEST ERROR:", error);
            alert("Unable to send extension request: " + error.message);
        } finally {
            setRequestingExtension(false);
        }
    };

    const cancelPendingPayment = async () => {
        if (!pendingPayment) return;

        const confirmed = window.confirm(
            `Cancel your pending ${pendingPayment.plan} payment? You can choose another plan after cancelling.`
        );

        if (!confirmed) return;

        try {
            setCancellingPayment(true);

            await updateDoc(doc(db, "payments", pendingPayment.id), {
                status: "Cancelled",
                cancelledAt: new Date().toISOString()
            });

            setPayments((current) =>
                current.map((payment) =>
                    payment.id === pendingPayment.id
                        ? { ...payment, status: "Cancelled" }
                        : payment
                )
            );
            setPendingPayment(null);

            alert("Pending payment cancelled. You can now choose another membership plan.");
        } catch (error) {
            console.error("Cancel payment error:", error);
            alert("Unable to cancel payment: " + error.message);
        } finally {
            setCancellingPayment(false);
        }
    };

    return (
        <div className="bg-light min-vh-100">
            <nav className="navbar navbar-dark bg-dark shadow-sm">
                <div className="container">
                    <span className="navbar-brand fw-bold">MOMENTUM GYM</span>
                    <div className="d-flex flex-wrap gap-2">
                        <button className="btn btn-outline-light btn-sm" onClick={() => navigate("/history")}>History</button>
                        <button className="btn btn-outline-light btn-sm" onClick={() => navigate("/profile")}>Profile</button>
                        <button className="btn btn-outline-light btn-sm" onClick={onLogout}>Logout</button>
                    </div>
                </div>
            </nav>

            <main className="container py-4 py-lg-5">
                <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
                    <div>
                        <span className="badge text-bg-danger mb-2">MEMBER</span>
                        <h1 className="fw-bold mb-1">Member Dashboard</h1>
                        <p className="text-secondary mb-0">Welcome, {user?.email}</p>
                    </div>
                </div>

                <div className="card border-0 bg-dark text-white shadow mb-4">
                    <div className="card-body p-4 p-lg-5">
                        <span className="text-danger fw-bold small">MEMBERSHIP</span>
                        <h2 className="fw-bold mt-2">Stay consistent. Keep progressing.</h2>
                        <p className="text-secondary mb-0">
                            Manage your membership, choose a plan, and track your payments in one place.
                        </p>
                    </div>
                </div>

                <section className="mb-5">
                    <h2 className="h3 fw-bold mb-3">My Membership</h2>

                    {activeMembership ? (
                        <div className={`card border-0 shadow-sm ${membershipIsExpired ? "border border-warning" : ""}`}>
                            <div className="card-body p-4">
                                <div className="d-flex flex-wrap justify-content-between gap-3">
                                    <div>
                                        <span className="text-secondary small">PLAN</span>
                                        <h3 className="h4 fw-bold mt-1">{activeMembership.plan}</h3>
                                    </div>
                                    <span className={`badge align-self-start ${membershipIsExpired ? "text-bg-warning" : "text-bg-success"}`}>
                                        {membershipIsExpired ? "Expired" : "Active"}
                                    </span>
                                </div>

                                <div className="row g-3 mt-2">
                                    <div className="col-md-4">
                                        <div className="p-3 bg-light rounded">
                                            <small className="text-secondary d-block">Amount</small>
                                            <strong>₱{activeMembership.amount}</strong>
                                        </div>
                                    </div>
                                    <div className="col-md-4">
                                        <div className="p-3 bg-light rounded">
                                            <small className="text-secondary d-block">Start Date</small>
                                            <strong>{activeMembership.startDate ? new Date(activeMembership.startDate).toLocaleDateString() : "—"}</strong>
                                        </div>
                                    </div>
                                    <div className="col-md-4">
                                        <div className="p-3 bg-light rounded">
                                            <small className="text-secondary d-block">Expiration</small>
                                            <strong>{activeMembership.expirationDate ? new Date(activeMembership.expirationDate).toLocaleDateString() : "—"}</strong>
                                        </div>
                                    </div>
                                </div>

                                <div className={`mt-4 p-4 rounded ${membershipIsExpired ? "bg-warning-subtle" : "bg-success-subtle"}`}>
                                    <small className="text-secondary d-block">MEMBERSHIP COUNTDOWN</small>
                                    <div className={`fs-2 fw-bold mt-1 ${membershipIsExpired ? "text-warning-emphasis" : "text-success-emphasis"}`}>
                                        {countdown?.text || "No expiration date"}
                                    </div>
                                    <small className="text-secondary">
                                        {membershipIsExpired
                                            ? "Your membership has expired."
                                            : "Time remaining until your membership expires."}
                                    </small>
                                </div>

                                {membershipIsExpired && !pendingPayment && (
                                    <button
                                        className="btn btn-danger mt-4"
                                        onClick={() => document.getElementById("membership-plans")?.scrollIntoView({ behavior: "smooth" })}
                                    >
                                        Renew Membership
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="alert alert-secondary mb-0">
                            <h3 className="h5">No active membership yet</h3>
                            <p className="mb-0">Choose a plan below to get started.</p>
                        </div>
                    )}
                </section>

                {notifications.length > 0 && (
                    <section className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h2 className="h5 fw-bold mb-0">Notifications</h2>
                            <span className="badge text-bg-danger">{notifications.length}</span>
                        </div>
                        <div className="d-grid gap-2">
                            {notifications.slice(0, 5).map((notification) => (
                                <div className="alert alert-info mb-0 shadow-sm" key={notification.id}>
                                    <strong>{notification.title || "Gym Notification"}</strong>
                                    <div>{notification.message}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {activeMembership && !membershipIsExpired && (
                    <section className="card border-0 shadow-sm mb-4">
                        <div className="card-body p-4">
                            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                                <div>
                                    <span className="text-danger fw-bold small">MEMBERSHIP</span>
                                    <h2 className="h5 fw-bold mt-1 mb-0">Request an Extension</h2>
                                </div>
                                <span className="badge text-bg-success">Active</span>
                            </div>
                            <div className="row g-3">
                                <div className="col-md-4">
                                    <label className="form-label fw-semibold">Additional Days</label>
                                    <input type="number" min="1" className="form-control" value={extensionDays} onChange={(e) => setExtensionDays(e.target.value)} />
                                </div>
                                <div className="col-md-8">
                                    <label className="form-label fw-semibold">Reason (optional)</label>
                                    <input className="form-control" value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} placeholder="Example: I want to continue training." />
                                </div>
                            </div>
                            <button className="btn btn-outline-danger mt-3" onClick={requestExtension} disabled={requestingExtension}>
                                {requestingExtension ? "Sending..." : "Request Extension"}
                            </button>
                        </div>
                    </section>
                )}

                {pendingPayment && (
                    <div className="alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-3 shadow-sm">
                        <div>
                            <strong>Waiting for admin approval</strong>
                            <div>{pendingPayment.plan} · ₱{pendingPayment.amount}</div>
                            <small className="text-secondary">Wrong plan? Cancel this pending payment and choose again.</small>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <span className="badge text-bg-warning">Pending</span>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={cancelPendingPayment}
                                disabled={cancellingPayment}
                                title="Cancel pending payment"
                            >
                                {cancellingPayment ? "Cancelling..." : "✕ Cancel"}
                            </button>
                        </div>
                    </div>
                )}

                <section id="membership-plans" className="mb-5">
                    <div className="d-flex flex-wrap justify-content-between align-items-end mb-3">
                        <div>
                            <span className="text-danger fw-bold small">PLANS</span>
                            <h2 className="h3 fw-bold mt-1">Membership Plans</h2>
                        </div>
                        <p className="text-secondary mb-1">Choose the plan that works for you.</p>
                    </div>

                    {loading && <div className="text-center py-4"><div className="spinner-border text-danger" /></div>}

                    {error && (
                        <div className="alert alert-danger">
                            {error}
                            <button className="btn btn-sm btn-outline-danger ms-3" onClick={() => window.location.reload()}>
                                Try Again
                            </button>
                        </div>
                    )}

                    {!loading && !error && plans.length === 0 && (
                        <div className="alert alert-secondary">No membership plans found.</div>
                    )}

                    <div className="row g-4">
                        {!loading && !error && plans.map((plan) => (
                            <div className="col-md-6 col-lg-4" key={plan.id}>
                                <div className="card h-100 border-0 shadow-sm">
                                    <div className="card-body p-4 d-flex flex-column">
                                        <span className="text-danger fw-bold small">MEMBERSHIP</span>
                                        <h3 className="h4 fw-bold mt-2">{plan.name}</h3>
                                        <p className="text-secondary">Duration: {plan.duration}</p>
                                        <div className="display-6 fw-bold mt-auto mb-3">₱{plan.price}</div>
                                        <button
                                            className="btn btn-danger w-100"
                                            disabled={pendingPayment !== null}
                                            onClick={() => navigate("/payment", { state: { plan } })}
                                        >
                                            {pendingPayment ? "Payment Pending" : "Select Plan"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

            </main>
        </div>
    );
}
