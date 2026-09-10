import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { roomApi } from '../api/room.api';
import { authApi } from '../api/auth.api';
import type { RoomDetails, AuditLogEntry, Category } from '../types';

const AVATAR_COLORS = ['#30D158', '#64D2FF', '#FF9F0A', '#BF5AF2', '#FFD60A', '#FF453A'];

export default function RoomSettingsPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [roomName, setRoomName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    Promise.all([
      roomApi.getDetails(roomId),
      roomApi.getAuditLog(roomId),
      roomApi.getCategories(roomId),
    ]).then(([roomRes, auditRes, catRes]) => {
      setRoom(roomRes.data);
      setRoomName(roomRes.data.name);
      setAuditLog(auditRes.data);
      setCategories(catRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [roomId]);

  const isAdmin = room?.members.find(m => m.userId === user?.id)?.role === 'ADMIN';

  const handleSaveName = async () => {
    if (!roomId || !roomName.trim()) return;
    await roomApi.update(roomId, { name: roomName.trim() });
    setRoom(r => r ? { ...r, name: roomName.trim() } : r);
    setEditing(false);
  };

  const handleAddCategory = async () => {
    if (!roomId || !newCategory.trim()) return;
    try {
      await roomApi.createCategory(roomId, newCategory.trim());
      const res = await roomApi.getCategories(roomId);
      setCategories(res.data);
      setNewCategory('');
    } catch { /* ignore */ }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!roomId) return;
    try {
      await roomApi.removeMember(roomId, userId);
      const res = await roomApi.getDetails(roomId);
      setRoom(res.data);
    } catch (err: any) {
      showToast(err.message || 'Failed to remove member', 'error');
    }
  };

  const formatAction = (action: string) => {
    const map: Record<string, string> = {
      'EXPENSE_CREATED': 'added expense',
      'EXPENSE_EDITED': 'edited expense',
      'EXPENSE_VOIDED': 'voided expense',
      'SETTLEMENT_CREATED': 'recorded settlement',
      'SETTLEMENT_EDITED': 'edited settlement',
      'SETTLEMENT_CANCELLED': 'cancelled settlement',
      'MEMBER_JOINED': 'joined the room',
      'MEMBER_LEFT': 'left the room',
      'MEMBER_ROLE_CHANGED': 'role changed',
    };
    return map[action] || action;
  };

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content">
          <div className="page-header">
            <div className="skeleton" style={{ width: 100, height: 24 }} />
          </div>
          <div style={{ padding: 20 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8, borderRadius: 'var(--radius-lg)' }} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        <div className="page-header">
          <button className="back-btn" onClick={() => navigate(`/rooms/${roomId}`)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="page-title">Room Settings</h1>
          <div style={{ width: 36 }} />
        </div>

        {/* Your UPI ID */}
        <div className="section">
          <div className="section-title"><span>Your UPI ID</span></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input 
              className="input-field" 
              placeholder="e.g. name@oksbi" 
              defaultValue={user?.upiId || ''} 
              onBlur={async (e) => {
                const newUpi = e.target.value.trim();
                if (newUpi !== user?.upiId) {
                  try {
                    await authApi.updateMe({ upiId: newUpi });
                    showToast('UPI ID saved!', 'success');
                  } catch (err: any) {
                    showToast(err.message || 'Failed to save UPI ID', 'error');
                  }
                }
              }}
              style={{ flex: 1, padding: '10px 14px', fontSize: 14 }} 
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Roommates will use this to settle up with you via UPI.
          </p>
        </div>

        {/* Room Name */}
        <div className="section">
          <div className="section-title"><span>Room Name</span></div>
          {editing && isAdmin ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="input-field" value={roomName} onChange={e => setRoomName(e.target.value)} style={{ flex: 1 }} />
              <button className="btn-small" style={{ background: 'var(--green)', color: '#000' }} onClick={handleSaveName}>Save</button>
              <button className="btn-small" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{room?.name}</span>
              {isAdmin && <button className="btn-small" onClick={() => setEditing(true)}>Edit</button>}
            </div>
          )}
        </div>

        {/* Invite Code */}
        <div className="section">
          <div className="section-title"><span>Invite Code</span></div>
          <div style={{
            marginTop: 12, padding: '14px 18px', background: 'var(--surface)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
            fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.05em', color: 'var(--green)', textAlign: 'center',
          }}>
            {room?.inviteCode}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'center' }}>
            Share this code with roommates to join
          </p>
        </div>

        {/* Members */}
        <div className="section">
          <div className="section-title">
            <span>Members ({room?.members.filter(m => m.status === 'ACTIVE').length})</span>
          </div>
          <div className="card-flat" style={{ marginTop: 12 }}>
            {room?.members.map((m, i) => (
              <div key={m.userId} className="list-row">
                <div className="list-row-left">
                  <div className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length], opacity: m.status === 'INACTIVE' ? 0.4 : 1 }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {m.name} {m.userId === user?.id ? '(You)' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', gap: 8 }}>
                      <span className={`badge ${m.role === 'ADMIN' ? 'badge-active' : ''}`} style={{ padding: '2px 8px', fontSize: 10 }}>
                        {m.role}
                      </span>
                      {m.status === 'INACTIVE' && <span className="badge badge-cancelled">Left</span>}
                    </div>
                  </div>
                </div>
                {isAdmin && m.userId !== user?.id && m.status === 'ACTIVE' && (
                  <button className="btn-small" style={{ fontSize: 12, color: 'var(--red)' }} onClick={() => handleRemoveMember(m.userId)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="section">
          <div className="section-title"><span>Categories</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {categories.map(c => (
              <span key={c.id} className="chip" style={{ cursor: 'default' }}>
                {c.name} {c.isPreset && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>•</span>}
              </span>
            ))}
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="input-field" placeholder="New category" value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ flex: 1, padding: '10px 14px', fontSize: 14 }} />
              <button className="btn-small" onClick={handleAddCategory}>Add</button>
            </div>
          )}
        </div>

        {/* Monthly Summary Link */}
        <div className="section">
          <Link to={`/rooms/${roomId}/summary`} style={{ textDecoration: 'none' }}>
            <div className="card-flat">
              <div className="list-row">
                <div className="list-row-left">
                  <span style={{ fontSize: 20 }}>📊</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>Monthly Summary</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Activity Log */}
        <div className="section">
          <div className="section-title"><span>Activity</span></div>
          {auditLog.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>No activity yet.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              {auditLog.slice(0, 20).map(entry => (
                <div key={entry.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{entry.userName}</span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{formatAction(entry.action)}</span>
                  {entry.reason && <span style={{ color: 'var(--text-tertiary)' }}> — "{entry.reason}"</span>}
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {new Date(entry.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 80 }} />
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <Link to={`/rooms/${roomId}`} className="nav-item">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 12l9-9 9 9h-3v9h-4v-6h-4v6H6v-9H3z"/></svg></div>
          Home
        </Link>
        <Link to={`/rooms/${roomId}/history`} className="nav-item">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></div>
          History
        </Link>
        <Link to={`/rooms/${roomId}/settle`} className="nav-item">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></div>
          Settle
        </Link>
        <Link to={`/rooms/${roomId}/settings`} className="nav-item active">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div>
          Room
        </Link>
      </nav>
    </div>
  );
}
