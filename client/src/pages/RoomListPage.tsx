import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { roomApi } from '../api/room.api';
import { formatPaise } from '../utils/currency.util';
import type { Room } from '../types';

const AVATAR_COLORS = ['#30D158', '#64D2FF', '#FF9F0A', '#BF5AF2', '#FFD60A', '#FF453A'];

export default function RoomListPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const res = await roomApi.list();
      setRooms(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newRoomName.trim()) return;
    setError('');
    try {
      const res = await roomApi.create(newRoomName.trim());
      setShowCreate(false);
      setNewRoomName('');
      showToast('Room created!', 'success');
      navigate(`/rooms/${res.data.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setError('');
    try {
      const res = await roomApi.join(inviteCode.trim());
      setShowJoin(false);
      setInviteCode('');
      showToast('Joined room!', 'success');
      navigate(`/rooms/${res.data.roomId}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-content">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="page-title">Your Rooms</h1>
            {user && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Hi, {user.name}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-small" onClick={() => setShowJoin(true)}>Join</button>
            <button className="btn-small" style={{ background: 'var(--green)', color: '#000' }} onClick={() => setShowCreate(true)}>+ New</button>
            <button className="btn-small" style={{ color: 'var(--red)' }} onClick={logout}>Logout</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '24px 20px' }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12, borderRadius: 'var(--radius-lg)' }} />)}
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏠</div>
            <div className="empty-state-title">No rooms yet</div>
            <div className="empty-state-text">Create a room or join one with an invite code.</div>
            <button className="btn-primary" style={{ maxWidth: 220, margin: '0 auto' }} onClick={() => setShowCreate(true)}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>+</span> Create Room
            </button>
          </div>
        ) : (
          <div style={{ padding: '8px 20px' }}>
            {rooms.map((room, idx) => (
              <div
                key={room.id}
                className="card-flat"
                style={{ marginBottom: 12, cursor: 'pointer' }}
                onClick={() => navigate(`/rooms/${room.id}`)}
              >
                <div className="list-row" style={{ padding: '18px 20px' }}>
                  <div className="list-row-left">
                    <div className="avatar" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}>
                      {room.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{room.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {room.memberCount} members
                      </div>
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Room Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2 className="modal-title">Create Room</h2>
              <div className="input-group">
                <label className="input-label">Room Name</label>
                <input
                  className="input-field"
                  placeholder="e.g. Room 304"
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              {error && <p className="error-text">{error}</p>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreate}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Join Room Modal */}
        {showJoin && (
          <div className="modal-overlay" onClick={() => setShowJoin(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2 className="modal-title">Join Room</h2>
              <div className="input-group">
                <label className="input-label">Invite Code</label>
                <input
                  className="input-field"
                  placeholder="e.g. R304-XJ2K"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
              </div>
              {error && <p className="error-text">{error}</p>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowJoin(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleJoin}>Join</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
