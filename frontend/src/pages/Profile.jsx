import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { updateProfile } from "firebase/auth";


export default function Profile({ user }) {
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        setName(user.displayName || "");
        setLoading(false);
    }, [user]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!name.trim()) return alert("Please enter your name.");
        try {
            setSaving(true);
            await updateProfile(user, { displayName: name.trim() });
            alert("Profile updated successfully!");
        } catch (error) {
            console.error("PROFILE UPDATE ERROR:", error);
            alert("Unable to update profile: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-light min-vh-100">
            <nav className="navbar navbar-dark bg-dark shadow-sm"><div className="container"><Link to="/member" className="navbar-brand fw-bold text-decoration-none">MOMENTUM GYM</Link><button className="btn btn-outline-light btn-sm" onClick={() => navigate("/member")}>Dashboard</button></div></nav>
            <main className="container py-4 py-lg-5"><div className="row justify-content-center"><div className="col-md-8 col-lg-6"><div className="card border-0 shadow-sm"><div className="card-body p-4 p-lg-5">
                <span className="badge text-bg-danger mb-2">PROFILE</span>
                <h1 className="h2 fw-bold">My Profile</h1>
                <p className="text-secondary">Manage your account information.</p>
                {loading ? <div className="text-center py-4"><div className="spinner-border text-danger" /></div> : <form onSubmit={handleSave}>
                    <div className="mb-3"><label className="form-label fw-semibold">Full Name</label><input className="form-control form-control-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" /></div>
                    <div className="mb-4"><label className="form-label fw-semibold">Email</label><input className="form-control form-control-lg" value={user?.email || ""} disabled /></div>
                    <button className="btn btn-danger btn-lg w-100" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
                </form>}
            </div></div></div></div></main>
        </div>
    );
}
