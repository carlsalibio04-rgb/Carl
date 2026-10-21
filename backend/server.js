const express = require("express");
const cors = require("cors");

const {
    initializeApp,
    cert,
    getApps
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = require("./serviceAccountKey.json");


if (getApps().length === 0) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();
const auth = getAuth();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



let membershipPlans = [
    { id: 1, name: "Weekly", duration: "7 Days", days: 7, price: 150 },
    { id: 2, name: "Monthly", duration: "30 Days", days: 30, price: 500 },
    { id: 3, name: "Yearly", duration: "365 Days", days: 365, price: 5000 }
];

let nextPlanID = 4;

let payments = [];
let nextPaymentID = 1;

let frontdesk = [];
let nextFrontDeskID = 1;

let extensionRequests = [];
let nextExtensionID = 1;

let notifications = [];
let nextNotificationID = 1;

let activityLogs = [];
let nextActivityID = 1;



async function verifyToken(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({
            message: "No token provided"
        });
    }

    try {
        req.user = await auth.verifyIdToken(token);
        next();
    } catch (err) {
        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
}


function requireRole(...roles) {
    return async (req, res, next) => {
        try {
            const doc = await db
                .collection("users")
                .doc(req.user.uid)
                .get();

            if (!doc.exists) {
                return res.status(403).json({
                    message: "User record not found"
                });
            }

            const data = doc.data();

            req.userRole = data.role;
            req.userData = data;

            if (!roles.includes(data.role)) {
                return res.status(403).json({
                    message: "Access denied"
                });
            }

            next();
        } catch (err) {
            return res.status(500).json({
                message: "Server error",
                error: err.message
            });
        }
    };
}

const adminOnly = requireRole("admin");
const staffOnly = requireRole("admin", "frontdesk");
const anyUser = requireRole("admin", "frontdesk", "member");



app.get("/", (req, res) => {
    res.json({
        message: "Gym Membership System API is running!"
    });
});



app.get("/api/me", verifyToken, async (req, res) => {
    try {
        const doc = await db.collection("users").doc(req.user.uid).get();

        if (!doc.exists) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.json(doc.data());
    } catch (err) {
        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
});

app.post("/api/users", verifyToken, async (req, res) => {
    try {
        const ref = db.collection("users").doc(req.user.uid);
        const existing = await ref.get();

        if (existing.exists) {
            await ref.set({
                name: req.body.name || existing.data().name
            }, { merge: true });

            return res.json({
                message: "User updated"
            });
        }

        await ref.set({
            name: req.body.name || "",
            email: req.user.email || "",
            uid: req.user.uid,
            role: "member"
        });

        res.status(201).json({
            message: "User created"
        });
    } catch (err) {
        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
});

app.get("/api/users", verifyToken, adminOnly, async (req, res) => {
    try {
        const snapshot = await db.collection("users").get();

        res.json(snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })));
    } catch (err) {
        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
});

app.patch("/api/users/:uid/role", verifyToken, adminOnly, async (req, res) => {
    const allowed = ["admin", "frontdesk", "member"];

    if (!allowed.includes(req.body.role)) {
        return res.status(400).json({
            message: "Invalid role"
        });
    }

    try {
        await db.collection("users")
            .doc(req.params.uid)
            .update({ role: req.body.role });

        res.json({
            message: "Role updated"
        });
    } catch (err) {
        res.status(404).json({
            message: "User not found",
            error: err.message
        });
    }
});


app.get("/api/plans", (req, res) => {
    res.json(membershipPlans);
});

app.post("/api/plans", verifyToken, adminOnly, (req, res) => {
    const plan = {
        id: nextPlanID++,
        name: req.body.name,
        duration: req.body.duration,
        days: Number(req.body.days),
        price: Number(req.body.price)
    };

    membershipPlans.push(plan);
    res.status(201).json(plan);
});

app.put("/api/plans/:id", verifyToken, adminOnly, (req, res) => {
    const id = Number(req.params.id);

    const index = membershipPlans.findIndex(item => item.id === id);

    if (index === -1) {
        return res.status(404).json({
            message: "Plan not found"
        });
    }

    membershipPlans[index] = {
        ...membershipPlans[index],
        ...req.body,
        id,
        price: req.body.price !== undefined
            ? Number(req.body.price)
            : membershipPlans[index].price
    };

    res.json(membershipPlans[index]);
});

app.delete("/api/plans/:id", verifyToken, adminOnly, (req, res) => {
    const id = Number(req.params.id);

    const index = membershipPlans.findIndex(item => item.id === id);

    if (index === -1) {
        return res.status(404).json({
            message: "Plan not found"
        });
    }

    const plan = membershipPlans.splice(index, 1)[0];

    res.json({
        message: "Plan deleted",
        plan
    });
});



app.get("/api/payments", verifyToken, anyUser, (req, res) => {
    if (req.userRole === "member") {
        return res.json(
            payments.filter(payment =>
                payment.email === req.userData.email
            )
        );
    }

    res.json(payments);
});

app.post("/api/payments", verifyToken, anyUser, (req, res) => {
    const payment = {
        id: nextPaymentID++,
        ...req.body,
        status: req.userRole === "member"
            ? "Pending"
            : (req.body.status || "Pending")
    };

    payments.push(payment);

    res.status(201).json({
        message: "Payment submitted successfully",
        payment
    });
});

app.put("/api/payments/:id", verifyToken, staffOnly, (req, res) => {
    const id = Number(req.params.id);

    const index = payments.findIndex(item => item.id === id);

    if (index === -1) {
        return res.status(404).json({
            message: "Payment not found"
        });
    }

    payments[index] = {
        ...payments[index],
        ...req.body,
        id
    };

    res.json(payments[index]);
});

app.patch("/api/payments/:id/status", verifyToken, staffOnly, (req, res) => {
    const payment = payments.find(
        item => item.id === Number(req.params.id)
    );

    if (!payment) {
        return res.status(404).json({
            message: "Payment not found"
        });
    }

    const allowedStatuses = ["Pending", "Approved", "Rejected"];

    if (!allowedStatuses.includes(req.body.status)) {
        return res.status(400).json({
            message: "Invalid payment status"
        });
    }

    payment.status = req.body.status;

    res.json({
        message: "Payment status updated",
        payment
    });
});

app.delete("/api/payments/:id", verifyToken, adminOnly, (req, res) => {
    const index = payments.findIndex(
        item => item.id === Number(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            message: "Payment not found"
        });
    }

    const payment = payments.splice(index, 1)[0];

    res.json({
        message: "Payment deleted",
        payment
    });
});



app.get("/api/frontdesk", verifyToken, staffOnly, (req, res) => {
    res.json(frontdesk);
});

app.post("/api/frontdesk", verifyToken, staffOnly, (req, res) => {
    const member = {
        id: nextFrontDeskID++,
        memberName: req.body.memberName,
        email: req.body.email,
        plan: req.body.plan,
        amount: String(req.body.amount),
        paymentMethod: "Cash",
        status: req.body.status || "Approved"
    };

    frontdesk.push(member);

    if (member.status === "Approved") {
        const selectedPlan = membershipPlans.find(
            item => item.name === member.plan
        );

        const startDate = new Date();
        const expirationDate = new Date(startDate);

        expirationDate.setDate(
            expirationDate.getDate() + (selectedPlan?.days || 0)
        );

        payments.push({
            id: nextPaymentID++,
            name: member.memberName,
            email: member.email,
            plan: member.plan,
            amount: Number(member.amount),
            duration: selectedPlan?.duration || "",
            paymentMethod: "Cash",
            status: "Approved",
            source: "Front Desk",
            startDate: startDate.toISOString(),
            expirationDate: expirationDate.toISOString()
        });
    }

    res.status(201).json(member);
});

app.put("/api/frontdesk/:id", verifyToken, staffOnly, (req, res) => {
    const id = Number(req.params.id);

    const index = frontdesk.findIndex(item => item.id === id);

    if (index === -1) {
        return res.status(404).json({
            message: "Front desk member not found"
        });
    }

    frontdesk[index] = {
        ...frontdesk[index],
        ...req.body,
        id,
        paymentMethod: "Cash"
    };

    res.json(frontdesk[index]);
});

app.delete("/api/frontdesk/:id", verifyToken, adminOnly, (req, res) => {
    const index = frontdesk.findIndex(
        item => item.id === Number(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            message: "Front desk member not found"
        });
    }

    const member = frontdesk.splice(index, 1)[0];

    res.json({
        message: "Front desk member deleted",
        frontdesk: member
    });
});



app.get("/api/extension-requests", verifyToken, anyUser, (req, res) => {
    if (req.userRole === "member") {
        return res.json(
            extensionRequests.filter(
                item => item.email === req.userData.email
            )
        );
    }

    res.json(extensionRequests);
});

app.post("/api/extension-requests", verifyToken, anyUser, (req, res) => {
    const item = {
        id: nextExtensionID++,
        ...req.body,
        status: "Pending"
    };

    extensionRequests.push(item);
    res.status(201).json(item);
});

app.put("/api/extension-requests/:id", verifyToken, staffOnly, (req, res) => {
    const id = Number(req.params.id);

    const index = extensionRequests.findIndex(item => item.id === id);

    if (index === -1) {
        return res.status(404).json({
            message: "Extension request not found"
        });
    }

    extensionRequests[index] = {
        ...extensionRequests[index],
        ...req.body,
        id
    };

    res.json(extensionRequests[index]);
});

app.delete("/api/extension-requests/:id", verifyToken, adminOnly, (req, res) => {
    const index = extensionRequests.findIndex(
        item => item.id === Number(req.params.id)
    );

    if (index === -1) {
        return res.status(404).json({
            message: "Extension request not found"
        });
    }

    const item = extensionRequests.splice(index, 1)[0];

    res.json({
        message: "Extension request deleted",
        item
    });
});


app.get("/api/notifications", verifyToken, anyUser, (req, res) => {
    res.json(notifications);
});

app.post("/api/notifications", verifyToken, anyUser, (req, res) => {
    const item = {
        id: nextNotificationID++,
        ...req.body
    };

    notifications.push(item);
    res.status(201).json(item);
});



app.get("/api/activity-logs", verifyToken, staffOnly, (req, res) => {
    res.json(activityLogs);
});

app.post("/api/activity-logs", verifyToken, anyUser, (req, res) => {
    const item = {
        id: nextActivityID++,
        ...req.body,
        createdAt: new Date().toISOString()
    };

    activityLogs.unshift(item);
    res.status(201).json(item);
});



app.use((err, req, res, next) => {
    console.error("Unhandled server error:", err);

    res.status(500).json({
        message: "Internal server error"
    });
});



const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
