"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./page.module.css";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
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
  kbsquiz?: boolean;
  bhajanquiz?: boolean;
};

type ChatMessage = {
  id: string;
  text?: string;
  sender?: string;
  senderRole?: string;
  createdAt?: any;
};

const SESSION_DOC_ID = "live_session_global";

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
  const [authUser, setAuthUser] = useState<any | null | undefined>(undefined);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

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
          kbsquiz: !!u.kbsquiz,
          bhajanquiz: !!u.bhajanquiz,
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
    let authResolved = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      authResolved = true;
      setAuthUser(user);
      if (user) {
        loadIfAdmin(user.uid);
      } else {
        // no user signed in -> show login form
        setError(null);
        setLoading(false);
      }
    });

    // fallback: if auth state didn't resolve in 1.5s, show login form
    const fallback = setTimeout(() => {
      if (mounted && !authResolved) {
        setLoading(false);
        setAuthUser(null);
      }
    }, 1500);

    return () => {
      mounted = false;
      unsubscribe();
      clearTimeout(fallback);
    };
  }, []);

  const getTimestampValue = (value: any) => {
    if (!value) return Date.now();
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? Date.now() : parsed;
    }
    if (value?.seconds) {
      const nanos = value.nanoseconds ? value.nanoseconds / 1_000_000 : 0;
      return value.seconds * 1000 + nanos;
    }
    return Date.now();
  };

  const getReadableChatTime = (value: any) => {
    const date = new Date(getTimestampValue(value));
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  useEffect(() => {
    if (!authUser) {
      setChatMessages([]);
      return;
    }

    const messagesRef = collection(db, "live_chats", SESSION_DOC_ID, "messages");
    const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const nextMessages = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        }));
        setChatMessages(nextMessages);
        setChatError(null);
      },
      (error) => {
        console.error("Failed to subscribe to chat messages:", error);
        setChatError("Unable to load chat messages right now.");
      }
    );

    return () => unsubscribe();
  }, [authUser]);

  const sendChatMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || chatSending || !authUser) return;

    setChatSending(true);
    try {
      const senderName = auth.currentUser?.displayName || auth.currentUser?.email || "Admin";
      await addDoc(collection(db, "live_chats", SESSION_DOC_ID, "messages"), {
        text: chatInput.trim(),
        sender: senderName,
        senderRole: "admin",
        createdAt: Date.now(),
      });
      setChatInput("");
      setChatError(null);
    } catch (error) {
      console.error("Failed to send chat message:", error);
      setChatError("Failed to send message. Please try again.");
    } finally {
      setChatSending(false);
    }
  };

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

  // global config state (single field for all users)
  const [timeleftforkbs, setTimeleftforkbs] = useState<string>("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

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
        kbsquiz: !!u.kbsquiz,
        bhajanquiz: !!u.bhajanquiz,
      });
      setRowErrorState(u.id, null);
    } catch (err) {
      console.error("Failed to save user:", err);
      setRowErrorState(u.id, (err as Error).message || "Failed to save");
    } finally {
      setRowSavingState(u.id, false);
    }
  };

  // Load global config (timeleftforkbs)
  const loadConfig = async () => {
    try {
      const cfgDoc = doc(db, "config", "global");
      const snap = await getDoc(cfgDoc);
      if (snap.exists()) {
        const data = snap.data() as any;
        const v = data.timeleftforkbs;
        if (v == null) {
          setTimeleftforkbs("");
        } else if (v instanceof Timestamp) {
          // convert to local datetime-local string
          const d = v.toDate();
          const pad = (n: number) => n.toString().padStart(2, "0");
          const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
            d.getMinutes()
          )}`;
          setTimeleftforkbs(local);
        } else if (typeof v === "string") {
          // try to parse string and convert to local datetime-local
          const d = new Date(v);
          if (!isNaN(d.getTime())) {
            const pad = (n: number) => n.toString().padStart(2, "0");
            const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
              d.getMinutes()
            )}`;
            setTimeleftforkbs(local);
          } else {
            setTimeleftforkbs(v);
          }
        } else {
          // unknown type -> stringify
          setTimeleftforkbs(String(v));
        }
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const saveConfig = async () => {
    setConfigSaving(true);
    setConfigError(null);
    try {
      const cfgDoc = doc(db, "config", "global");
      if (!timeleftforkbs) {
        await setDoc(cfgDoc, { timeleftforkbs: null }, { merge: true });
      } else {
        // convert local datetime-local string to Date (interpreted as local) and then to Timestamp
        const d = new Date(timeleftforkbs);
        if (isNaN(d.getTime())) {
          // fallback: save raw string
          await setDoc(cfgDoc, { timeleftforkbs }, { merge: true });
        } else {
          const ts = Timestamp.fromDate(d);
          await setDoc(cfgDoc, { timeleftforkbs: ts }, { merge: true });
        }
      }
    } catch (err) {
      console.error("Failed to save config:", err);
      setConfigError((err as Error).message || "Failed to save config");
    } finally {
      setConfigSaving(false);
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
        ) : authUser === null ? (
          // no signed-in user -> show login form
          <div>
            {error ? <p style={{ color: "red" }}>Error: {error}</p> : null}
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
        ) : error ? (
          <div>
            <p style={{ color: "red" }}>Error: {error}</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <div>Signed in as: {currentUid}</div>
              <button onClick={handleSignOut}>Sign out</button>
            </div>
            {/* Global config (single field for all users) */}
            <div style={{ marginBottom: 12, border: "1px solid #6e6969ff", padding: 12, backgroundColor: "#f5f5f5" }}>
              <label style={{color:"#202124",}}>
                time left for kbs: <input value={timeleftforkbs} onChange={(e) => setTimeleftforkbs(e.target.value)} placeholder="string or timestamp" />
              </label>
              <button onClick={saveConfig} disabled={configSaving} style={{ marginLeft: 8, color: "white", backgroundColor: "#0070f3", border: "none", padding: "6px 12px", cursor: "pointer" }}>
                {configSaving ? "Saving..." : "Save config"}
              </button>
              {configError ? <div style={{ color: "red" }}>{configError}</div> : null}
            </div>

            <div
              style={{
                marginBottom: 24,
                border: "1px solid #d9d9d9",
                borderRadius: 12,
                padding: 16,
                backgroundColor: "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Live Session Chat</h4>
                <span style={{ fontSize: 12, color: "#666" }}>Session: {SESSION_DOC_ID}</span>
              </div>
              <div
                style={{
                  maxHeight: 240,
                  overflowY: "auto",
                  padding: 12,
                  border: "1px solid #eee",
                  borderRadius: 8,
                  backgroundColor: "#fff",
                  marginBottom: 12,
                }}
              >
                {chatMessages.length === 0 ? (
                  <p style={{ color: "#777", textAlign: "center" }}>No messages yet. Start the conversation!</p>
                ) : (
                  chatMessages.map((message) => {
                    const isAdmin = message.senderRole === "admin";
                    return (
                      <div
                        key={message.id}
                        style={{
                          textAlign: isAdmin ? "right" : "left",
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "inline-block",
                            padding: "8px 12px",
                            borderRadius: 8,
                            backgroundColor: isAdmin ? "#e0d4ff" : "#f0f0f0",
                            maxWidth: "80%",
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#5b2bd1" }}>
                            {message.sender || (isAdmin ? "Admin" : "Player")}
                          </div>
                          <div style={{ fontSize: 14, color: "#222" }}>{message.text}</div>
                          <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{getReadableChatTime(message.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form onSubmit={sendChatMessage} style={{ display: "flex", gap: 12 }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message to the player..."
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    fontSize: 14,
                  }}
                  disabled={chatSending}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatSending}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: chatInput.trim() ? "#450693" : "#9c9c9c",
                    color: "#fff",
                    cursor: chatInput.trim() && !chatSending ? "pointer" : "not-allowed",
                    minWidth: 90,
                  }}
                >
                  {chatSending ? "Sending..." : "Send"}
                </button>
              </form>
              {chatError ? <div style={{ color: "red", marginTop: 8 }}>{chatError}</div> : null}
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Post Approve</th>
                  <th>Post Edit</th>
                  <th>Post Delete</th>
                  <th>Post Visible</th>
                  <th>kbsquiz</th>
                  <th>bhajanquiz</th>
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
                      <input type="checkbox" checked={!!user.kbsquiz} onChange={() => handleCheckboxChange(user.id, "kbsquiz" as any)} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!user.bhajanquiz} onChange={() => handleCheckboxChange(user.id, "bhajanquiz" as any)} />
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
