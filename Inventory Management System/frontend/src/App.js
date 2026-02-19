import React, { useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { Trash2, Package, LogOut, PlusSquare, AlertTriangle, RefreshCw, Box, CheckSquare, Edit3, XSquare, Save } from 'lucide-react';

const API_URL = "http://127.0.0.1:8000";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('myToken'));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editName, setEditName] = useState("");
  const [editingNameId, setEditingNameId] = useState(null);
  const [adjustments, setAdjustments] = useState([]);

  // Format timestamp to 24-hour local representation
  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      let s = String(ts);
      // Convert "YYYY-MM-DD HH:MM:SS[.micro]" to ISO-like "YYYY-MM-DDTHH:MM:SS"
      if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
      if (s.includes('.')) s = s.split('.')[0];
      const d = new Date(s);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
      return ts;
    }
  }

  // 1. Decode Role from JWT
  let role = "";
  if (token) {
    try {
      const decoded = jwtDecode(token);
      role = decoded.role;
    } catch (e) {
      localStorage.removeItem('myToken');
      setToken(null);
    }
  }

  // 2. Fetch Inventory
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/items`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchAdjustments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/adjustments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdjustments(data);
      }
    } catch (err) {
      console.error('Failed to fetch adjustments', err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchItems();
      if (role === 'owner') fetchAdjustments();
    }
  }, [token, role, fetchItems, fetchAdjustments]);

  // 3. Handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('username', e.target.username.value);
    formData.append('password', e.target.password.value);

    const res = await fetch(`${API_URL}/login`, { method: 'POST', body: formData });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('myToken', data.access_token);
      setToken(data.access_token);
    } else {
      alert("Invalid login credentials");
    }
  };

  const addItem = async (e) => {
    e.preventDefault();
    const newItem = {
      name: e.target.name.value,
      quantity: parseInt(e.target.qty.value)
    };

    const res = await fetch(`${API_URL}/add-item`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(newItem)
    });

    if (res.ok) {
      e.target.reset();
      fetchItems();
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Permanent delete this item?")) return;
    const res = await fetch(`${API_URL}/items/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) fetchItems();
  };

  const updateQuantity = async (id, name) => {
    const orig = items.find(i => i.id === id);
    if (!orig) return;
    const q = parseInt(editQuantity, 10);
    const newName = editName != null ? editName : name;
    const delta = q - orig.quantity;

    // If quantity changes, ensure reason is provided and valid
    const allowed = ["supplier delivery", "goods moved", "damaged goods"];
    if (delta !== 0) {
      if (!editReason || !allowed.includes(editReason)) {
        alert('Please select a valid reason for the quantity change.');
        return;
      }
      // Enforce reason sign on client as extra safety
      if (delta > 0 && editReason !== 'supplier delivery') {
        alert("Positive quantity changes must use reason 'supplier delivery'.");
        return;
      }
      if (delta < 0 && editReason === 'supplier delivery') {
        alert("Decreasing quantity cannot use reason 'supplier delivery'.");
        return;
      }
    }

    const res = await fetch(`${API_URL}/items/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: newName,
        quantity: q,
        reason: editReason || null
      })
    });

    if (res.ok) {
      setEditingId(null);
      setEditQuantity("");
      setEditName("");
      setEditReason("");
      fetchItems();
      fetchAdjustments();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || 'Failed to update item');
    }
  };

  const updateName = async (id) => {
    const orig = items.find(i => i.id === id);
    if (!orig) return;
    if (!editName || editName.trim() === "") {
      alert('Name cannot be empty');
      return;
    }

    const res = await fetch(`${API_URL}/items/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: editName.trim(),
        quantity: orig.quantity,
        reason: null
      })
    });

    if (res.ok) {
      setEditingNameId(null);
      setEditName("");
      fetchItems();
      fetchAdjustments();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || 'Failed to update name');
    }
  };

  // Validate that a reason is selected and quantity is a non-negative integer
  const isValidAdjustment = () => {
    const allowed = ["supplier delivery", "goods moved", "damaged goods"];
    if (!allowed.includes(editReason)) return false;
    const q = parseInt(editQuantity, 10);
    if (isNaN(q) || q < 0) return false;
    // Need the original item to decide if this is an increase or decrease
    const orig = items.find(i => i.id === editingId);
    if (!orig) return false;
    const delta = q - orig.quantity;
    // If increasing, reason must be 'supplier delivery'
    if (delta > 0 && editReason !== 'supplier delivery') return false;
    // If decreasing, reason must NOT be 'supplier delivery'
    if (delta < 0 && editReason === 'supplier delivery') return false;
    return true;
  };

  // --- VIEW: LOGIN (BOXY & BRIGHT) ---
  if (!token) {
    return (
      <div className="min-h-screen bg-[#FFDE59] flex items-center justify-center p-6 font-mono">
        <div className="w-full max-w-md bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#5271FF] border-4 border-black flex items-center justify-center mb-4">
              <Package className="text-white w-10 h-10" />
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tighter">STOCK BOX</h2>
            <p className="font-bold text-xs mt-2 bg-black text-white px-2 py-1">V2.0.1_STABLE</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <input name="username" required className="w-full px-4 py-3 border-4 border-black outline-none font-bold placeholder-gray-400" placeholder="USERNAME" />
            <input name="password" type="password" required className="w-full px-4 py-3 border-4 border-black outline-none font-bold placeholder-gray-400" placeholder="PASSWORD" />
            <button className="w-full bg-[#FF5757] text-white font-black py-4 border-4 border-black hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all uppercase italic">
              Access Vault
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- VIEW: DASHBOARD (COLOURFUL GRID) ---
  return (
    <div className="min-h-screen bg-[#F0F0F0] font-mono text-black">
      {/* Header */}
      <nav className="bg-[#5271FF] border-b-4 border-black px-8 py-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-4">
          <Box size={32} strokeWidth={3} />
          <h1 className="text-2xl font-black italic uppercase">WAREHOUSE INVENTORY MANAGER</h1>
          <div className="hidden sm:block h-8 w-1 bg-white mx-2"></div>
          <span className="bg-yellow-400 text-black border-2 border-black px-2 py-0 text-[20px] font-black uppercase">
             {role}
          </span>
        </div>
        <button onClick={() => { localStorage.removeItem('myToken'); setToken(null); }} className="bg-white text-black border-4 border-black px-4 py-1 font-black hover:bg-red-400 transition-colors uppercase flex items-center gap-2">
          <LogOut size={16}/> Logout
        </button>
      </nav>

      <main className="max-w-7xl mx-auto p-8 grid grid-cols-12 gap-8">
        
        {/* Sidebar Controls */}
        {role === "owner" && (
          <div className="col-span-12 lg:col-span-4 space-y-8">
            {/* Add Item Form */}
            <div className="bg-[#7ED957] border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <h3 className="text-xl font-black uppercase mb-6 flex items-center gap-2">
                <PlusSquare /> New Stock
              </h3>
              <form onSubmit={addItem} className="space-y-4">
                <input name="name" placeholder="ITEM LABEL" required className="w-full p-3 border-4 border-black bg-white font-bold outline-none" />
                <input name="qty" type="number" placeholder="QTY" required className="w-full p-3 border-4 border-black bg-white font-bold outline-none" />
                <button className="w-full py-3 bg-black text-white font-black hover:bg-white hover:text-black border-4 border-black transition-all">
                  ENTER
                </button>
              </form>
            </div>

            {/* Adjustment Logs */}
            <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black uppercase text-sm md:text-base">Recent Logs</h3>
                <button onClick={fetchAdjustments} className="p-2 border-2 border-black bg-yellow-400 rounded"><RefreshCw size={16} /></button>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-black">
                {adjustments.length === 0 ? (
                  <div className="text-sm text-gray-500">No recent adjustments.</div>
                ) : (
                  adjustments.map(adj => (
                    <div key={adj.id} className="text-sm border-2 border-black p-3 bg-slate-50 rounded">
                      <div className="font-bold uppercase truncate text-sm">{adj.item_name}</div>
                      <div className={adj.delta > 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                        {adj.delta > 0 ? `+${adj.delta}` : adj.delta} <span className="text-gray-600">| {adj.reason}</span>
                      </div>
                      <div className="mt-1 opacity-60 text-[11px]">{formatTimestamp(adj.timestamp)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Inventory List */}
        <div className={`col-span-12 ${role === 'owner' ? 'lg:col-span-8' : ''}`}>
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
              <div className="p-3 border-b-4 border-black bg-[#CB6CE6] flex justify-between items-center">
              <h3 className="font-black text-white uppercase text-base">INVENTORY</h3>
              <button onClick={fetchItems} className="bg-white p-1 border-2 border-black active:translate-y-[2px]">
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            
            <table className="w-full text-left border-collapse">
  <thead className="bg-black text-white font-black uppercase text-sm">
    <tr>
      <th className="px-6 py-3 tracking-wide">ITEM</th>
      <th className="px-6 py-3 tracking-wide text-center">STOCK</th>
      <th className="px-6 py-3 tracking-wide text-center">STATUS</th>
      <th className="px-6 py-3 tracking-wide text-right">EDIT</th>
    </tr>
  </thead>
  <tbody className="divide-y-4 divide-black">
    {items.map(item => (
      <tr key={item.id} className="hover:bg-yellow-50 font-black transition-colors group">
        {/* Increased row text to text-xl for high visibility */}
        <td className="px-6 py-4 text-lg uppercase tracking-tighter text-black">
          {editingNameId === item.id ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full text-lg px-2 py-1 border-4 border-black bg-white text-center outline-none"
              autoFocus
            />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-black">{item.name}</span>
              {role === 'owner' && (
                <button onClick={() => { setEditingNameId(item.id); setEditName(item.name); }} className="ml-2 text-sm bg-white border-2 border-black px-2 py-1 hover:bg-blue-200">Edit</button>
              )}
            </div>
          )}
        </td>
        
        <td className="px-6 py-4 text-center">
          {editingId === item.id ? (
            <div className="flex flex-col items-center gap-3">
              <input
                type="number"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                className="w-20 text-lg px-2 py-1 border-4 border-black bg-yellow-200 text-center outline-none"
                autoFocus
              />
              <select
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="w-full text-sm border-2 border-black bg-white p-1 uppercase font-bold"
              >
                <option value="supplier delivery">Delivery (+)</option>
                <option value="goods moved">Export (-)</option>
                <option value="damaged goods">Waste (-)</option>
              </select>
            </div>
            ) : (
            <span className="text-2xl">{item.quantity}</span>
          )}
        </td>

        <td className="px-8 py-8">
          <div className="flex justify-center">
            {item.quantity < 5 ? (
              <div className="bg-[#FF5757] text-white border-4 border-black px-4 py-2 flex items-center gap-2 text-sm font-black italic shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <AlertTriangle size={18} /> REFILL_NOW
              </div>
            ) : (
              <div className="bg-[#7ED957] text-black border-4 border-black px-4 py-2 flex items-center gap-2 text-sm font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <CheckSquare size={18} /> NOMINAL
              </div>
            )}
          </div>
        </td>

            <td className="px-6 py-4 text-right">
              <div className="flex justify-end gap-2">
            {editingId === item.id ? (
              <>
                    <button
                      onClick={() => { if (!isValidAdjustment()) return; updateQuantity(item.id, item.name); }}
                      disabled={!isValidAdjustment()}
                      className={`${isValidAdjustment() ? 'bg-black hover:bg-green-500' : 'bg-gray-400 cursor-not-allowed'} text-white p-2 border-4 border-black transition-all`}
                    >
                      <Save size={18} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="bg-white text-black p-2 border-4 border-black hover:bg-red-500 hover:text-white transition-all">
                      <XSquare size={18} />
                    </button>
              </>
            ) : editingNameId === item.id ? (
              <>
                    <button onClick={() => updateName(item.id)} className="bg-black text-white p-2 border-4 border-black hover:bg-green-500 transition-all"><Save size={18}/></button>
                    <button onClick={() => { setEditingNameId(null); setEditName(''); }} className="bg-white text-black p-2 border-4 border-black hover:bg-red-500 hover:text-white transition-all"><XSquare size={18}/></button>
              </>
            ) : (
              <div className="flex gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setEditingId(item.id);
                    setEditQuantity(item.quantity.toString());
                    setEditReason('');
                  }} 
                  className="bg-white border-4 border-black p-2 hover:bg-blue-400 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                >
                  <Edit3 size={18} />
                </button>
                {role === "owner" && (
                  <button onClick={() => deleteItem(item.id)} className="bg-black text-white p-2 border-4 border-black hover:bg-red-500 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
        </td>
      </tr>
    ))}
  </tbody>
</table>
          </div>
        </div>
      </main>
    </div>
  );
}