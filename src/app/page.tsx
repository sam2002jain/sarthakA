"use client";
import React, { useState } from "react";
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  // Sample list of users
  const [users, setUsers] = useState([
    {
      id: 1,
      name: "John Doe",
      rights: { view: false, edit: false, delete: false },
    },
    {
      id: 2,
      name: "Jane Smith",
      rights: { view: true, edit: false, delete: false },
    },
    {
      id: 3,
      name: "Michael Johnson",
      rights: { view: true, edit: true, delete: false },
    },
  ]);

  // Toggle checkbox for rights
  const handleCheckboxChange = (userId:any, right:any) => {
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              rights: {
                ...user.rights,
                [right]: !user.rights[right],
              },
            }
          : user
      )
    );
  };

  // Save action
  const handleSave = () => {
    alert("User rights updated successfully!");
    console.log("Updated Users:", users);
    // Here you can call your API to save user rights to the backend
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <Image
          className={styles.logo}
          src="/onlinejainmanchlogo.jpeg"
          alt="Online Jain Manch Logo"
          width={80}
          height={80}
        />
        <h2>Online Jain Manch - Admin Panel</h2>
      </header>

      {/* CONTAINER */}
      <div className={styles.container}>
        <h3 className={styles.title}>Assign User Rights</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User</th>
              <th>View</th>
              <th>Edit</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={user.rights.view}
                    onChange={() => handleCheckboxChange(user.id, "view")}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={user.rights.edit}
                    onChange={() => handleCheckboxChange(user.id, "edit")}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={user.rights.delete}
                    onChange={() => handleCheckboxChange(user.id, "delete")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className={styles.saveButton} onClick={handleSave}>
          Save Changes
        </button>
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
