import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "../lib/memoryDb.js";

import { db } from "../lib/memoryDb.js";

export default function History({ user }) {
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadHistory = async () => {
            if (!user) return;

            try {
                setLoading(true);
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
            } catch (error) {
                console.error("HISTORY ERROR:", error);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, [user]);

    const formatDate = (value) => {
        if (!value) return "—";
        const date = value?.toDate?.() || new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
    };

    return (
        <div className="bg-light min-vh-100">
            <nav className="navbar navbar-dark bg-dark shadow-sm">
                <div className="container">
                    <Link to="/member" className="navbar-brand fw-bold text-decoration-none">
                        MOMENTUM GYM
                    </Link>
                    <div className="d-flex gap-2">
                        <button className="btn btn-outline-light btn-sm" onClick={() => navigate("/profile")}>Profile</button>
                        <button className="btn btn-outline-light btn-sm" onClick={() => navigate("/member")}>Dashboard</button>
                    </div>
                </div>
            </nav>

            <main className="container py-4 py-lg-5">
                <div className="mb-4">
                    <span className="badge text-bg-danger mb-2">MEMBER</span>
                    <h1 className="fw-bold mb-1">Payment History</h1>
                    <p className="text-secondary mb-0">View all your membership payment records.</p>
                </div>

                {loading ? (
                    <div className="text-center py-5">
                        <div className="spinner-border text-danger" role="status" />
                    </div>
                ) : payments.length === 0 ? (
                    <div className="alert alert-secondary">No payment records yet.</div>
                ) : (
                    <div className="table-responsive bg-white rounded shadow-sm">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-dark">
                                <tr>
                                    <th>Plan</th>
                                    <th>Amount</th>
                                    <th>Method</th>
                                    <th>Status</th>
                                    <th>Start</th>
                                    <th>Expiration</th>
                                    <th>Submitted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((payment) => (
                                    <tr key={payment.id}>
                                        <td className="fw-semibold">{payment.plan}</td>
                                        <td>₱{payment.amount}</td>
                                        <td>{payment.paymentMethod || "—"}</td>
                                        <td>
                                            <span className={`badge ${payment.status === "Approved" ? "text-bg-success" : "text-bg-warning"}`}>
                                                {payment.status}
                                            </span>
                                        </td>
                                        <td>{formatDate(payment.startDate)}</td>
                                        <td>{formatDate(payment.expirationDate)}</td>
                                        <td>{formatDate(payment.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
