import React, { useState, useEffect } from 'react';

function OwnerDashboard({ token }) {
  const [employees, setEmployees] = useState([]);

  // In a real app, you'd fetch this from a backend route like /admin/employees
  useEffect(() => {
    // Mock data for now to see your design
    setEmployees([
      { id: 1, name: "Employee A", salary: "$50,000", lastLogin: "10:00 AM" },
      { id: 2, name: "Employee B", salary: "$45,000", lastLogin: "09:15 AM" }
    ]);
  }, []);

  return (
    <div style={{ backgroundColor: '#f4f4f4', padding: '20px', borderRadius: '10px' }}>
      <h2 style={{ color: '#2c3e50' }}>👑 Owner Control Panel</h2>
      
      <h3>Employee Management</h3>
      <table border="1" cellPadding="10" style={{ width: '100%', backgroundColor: 'white' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Salary</th>
            <th>Last Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id}>
              <td>{emp.name}</td>
              <td>{emp.salary}</td>
              <td>{emp.lastLogin}</td>
              <td><button>Edit Salary</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default OwnerDashboard;