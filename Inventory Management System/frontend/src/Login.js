import React, { useState } from 'react';

function Login({ setToken }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    const response = await fetch('http://127.0.0.1:8000/login', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (data.access_token) {
      setToken(data.access_token); // Save the key!
      localStorage.setItem('myToken', data.access_token);
    } else {
      alert("Login Failed");
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <h2>Login to Inventory</h2>
      <input type="text" placeholder="Username" onChange={e => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
}

export default Login;