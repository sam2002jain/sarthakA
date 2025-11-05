"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./page.module.css";
import { collection, doc, getDocs, updateDoc, getDoc, query, where, setDoc } from "firebase/firestore";
import { db, auth } from "../../firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

type User = {
  id: string;
  name?: string;
  email?: string;
  // top-level flags (not nested in `rights`)
  postapproval?: boolean;
  postdelete?: boolean;
  postedit?: boolean;
  postvisible?: boolean;
  isAdmin?: boolean;
};

// Data contract:
// Each document in `login` collection is expected to have:
// { name: string, rights: { postapproval?: boolean, postdelete?: boolean, postedit?: boolean, postvisible?: boolean, ... } }

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  // Auth gating + Fetch users from `login` collection (top-level flags)
  useEffect(() => {
    let mounted = true;

    const loadIfAdmin = async (uid: string | null) => {
      if (!uid) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      try {
        // Verify current user's admin status by reading their `login` doc (by uid)
        const myDocRef = doc(db, "login", uid);
        const myDoc = await getDoc(myDocRef);
        const myData = myDoc.exists() ? (myDoc.data() as any) : null;
        // If doc exists and indicates admin, proceed. Otherwise try to find by email.
        if (!myData || !myData.isAdmin) {
          // try to find a login doc that matches the user's email
          const usersByEmailQ = query(collection(db, "login"), where("email", "==", auth.currentUser?.email || ""));
          const byEmailSnap = await getDocs(usersByEmailQ);
          let byEmailDoc: any = null;
          if (!byEmailSnap.empty) {
            byEmailDoc = { id: byEmailSnap.docs[0].id, ...(byEmailSnap.docs[0].data() as any) };
          }

          // If found by email and isAdmin true, continue
          if (byEmailDoc && byEmailDoc.isAdmin) {
            // optionally, create a uid-mapped doc so future checks by uid work
            try {
              await setDoc(doc(db, "login", uid), { ...byEmailDoc, email: byEmailDoc.email || auth.currentUser?.email || "" });
            } catch (e) {
              // non-fatal
              console.warn("Could not create uid-mapped login doc:", e);
            }
          } else {
            // If not found but the signed-in email is the known admin email, create the doc with isAdmin
            const signedInEmail = auth.currentUser?.email || "";
            if (signedInEmail === "admin@gmail.com") {
              // create a login doc for this uid and mark admin
              await setDoc(doc(db, "login", uid), {
                email: signedInEmail,
                name: auth.currentUser?.displayName || "Admin",
                isAdmin: true,
              });
            } else {
              setError("Access denied: admin only");
              setLoading(false);
              return;
            }
          }
        }
        setCurrentUid(uid);

        // current user is admin -> fetch all users
  const colRef = collection(db, "login");
  const snap = await getDocs(colRef);
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as User[];
        // Normalize top-level flags
        const normalized = list.map((u) => ({
          ...u,
          postapproval: !!u.postapproval,
          postdelete: !!u.postdelete,
          postedit: !!u.postedit,
          postvisible: !!u.postvisible,
        }));
        if (mounted) setUsers(normalized);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        if (mounted) setError((err as Error).message || "Failed to load users");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // listen for auth state
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadIfAdmin(user.uid);
      } else {
        setError("Not authenticated");
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleCheckboxChange = (userId: string, field: keyof User) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, [field]: !(u as any)[field] } : u))
    );
  };
  // Per-row save state maps
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
  const [rowErrorMap, setRowErrorMap] = useState<Record<string, string | null>>({});

  const setRowSavingState = (id: string, v: boolean) => setRowSaving((p) => ({ ...p, [id]: v }));
  const setRowErrorState = (id: string, msg: string | null) => setRowErrorMap((p) => ({ ...p, [id]: msg }));

  const saveUser = async (u: User) => {
    setRowSavingState(u.id, true);
    setRowErrorState(u.id, null);
    try {
      const userRef = doc(db, "login", u.id);
      await updateDoc(userRef, {
        postapproval: !!u.postapproval,
        postedit: !!u.postedit,
        postdelete: !!u.postdelete,
        postvisible: !!u.postvisible,
      });
      setRowErrorState(u.id, null);
    } catch (err) {
      console.error("Failed to save user:", err);
      setRowErrorState(u.id, (err as Error).message || "Failed to save");
    } finally {
      setRowSavingState(u.id, false);
    }
  };

  // Simple email/password sign-in (admin login)
  const handleSignIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setAuthenticating(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will trigger and call loadIfAdmin
      setEmail("");
      setPassword("");
    } catch (err) {
      console.error("Sign-in failed:", err);
      setError((err as Error).message || "Sign-in failed");
    } finally {
      setAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setCurrentUid(null);
    setUsers([]);
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <Image className={styles.logo} src="/onlinejainmanchlogo.jpeg" alt="Online Jain Manch Logo" width={80} height={80} />
        <h2>Online Jain Manch - Admin Panel</h2>
      </header>

      {/* CONTAINER */}
      <div className={styles.container}>
        <h3 className={styles.title}>Assign User Rights</h3>

        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <div>
            <p style={{ color: "red" }}>Error: {error}</p>
            {/* If not authenticated or access denied, show sign-in form */}
            <form onSubmit={handleSignIn} style={{ marginTop: 12 }}>
              <div>
                <label>
                  Email: <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                </label>
              </div>
              <div>
                <label>
                  Password: <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
                </label>
              </div>
              <div style={{ marginTop: 8 }}>
                <button type="submit" disabled={authenticating}>{authenticating ? "Signing in..." : "Sign in"}</button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <div>Signed in as: {currentUid}</div>
              <button onClick={handleSignOut}>Sign out</button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Post Approve</th>
                  <th>Post Edit</th>
                  <th>Post Delete</th>
                  <th>Post Visible</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name || user.email || user.id}</td>
                    <td>
                      <input type="checkbox" checked={!!user.postapproval} onChange={() => handleCheckboxChange(user.id, "postapproval")} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!user.postedit} onChange={() => handleCheckboxChange(user.id, "postedit")} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!user.postdelete} onChange={() => handleCheckboxChange(user.id, "postdelete")} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!user.postvisible} onChange={() => handleCheckboxChange(user.id, "postvisible")} />
                    </td>
                    <td>
                      <button
                        className={styles.saveButton}
                        onClick={() => saveUser(user)}
                        disabled={!!rowSaving[user.id]}
                      >
                        {rowSaving[user.id] ? "Saving..." : "Save"}
                      </button>
                      {rowErrorMap[user.id] ? (
                        <div style={{ color: "red", fontSize: 12 }}>{rowErrorMap[user.id]}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* per-row save buttons shown in Actions column */}
          </>
        )}
      </div>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div>
          <p>Powered by: Sarthak Digital</p>
        </div>
      </footer>
    </div>
  );
}
