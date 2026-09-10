import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRoomBalances } from '../hooks/useRoomBalances';
import { roomApi } from '../api/room.api';
import { formatPaise, formatPaiseAmount } from '../utils/currency.util';
import type { RoomDetails, BalanceEntry, SettlementSuggestion } from '../types';

const AVATAR_COLORS = ['#30D158', '#64D2FF', '#FF9F0A', '#BF5AF2', '#FFD60A', '#FF453A'];

function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function RoomDashboardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: balancesData, loading: balancesLoading, error: balancesError } = useRoomBalances(roomId);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    roomApi.getDetails(roomId).then(res => {
      setRoom(res.data);
      setRoomLoading(false);
    }).catch(() => setRoomLoading(false));
  }, [roomId]);

  if (roomLoading || balancesLoading) {
    return (
      <div className="app-shell">
        <div className="app-content">
          <div className="page-header">
            <div className="skeleton" style={{ width: 120, height: 28 }} />
            <div style={{ display: 'flex', gap: 4 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ width: 26, height: 26, borderRadius: '50%' }} />)}
            </div>
          </div>
          <div style={{ margin: '20px' }}>
            <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-xl)' }} />
          </div>
          <div style={{ margin: '20px' }}>
            <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
          </div>
        </div>
      </div>
    );
  }

  const myBalance = balancesData?.balances.find(b => b.userId === user?.id);
  const myOutstanding = myBalance?.outstandingPaise || 0;
  const isPositive = myOutstanding > 0;
  const isSettled = myOutstanding === 0;

  // Find settlement suggestions relevant to current user
  const mySuggestions = balancesData?.suggestedSettlements.filter(
    s => s.fromUserId === user?.id || s.toUserId === user?.id
  ) || [];

  // Other members' balances (excluding current user)
  const otherBalances = balancesData?.balances.filter(b => b.userId !== user?.id) || [];

  // Map member names
  const memberMap = new Map(room?.members.map((m, i) => [m.userId, { name: m.name, colorIdx: i }]) || []);

  const getName = (userId: string) => memberMap.get(userId)?.name || 'Unknown';
  const getColorIdx = (userId: string) => memberMap.get(userId)?.colorIdx || 0;

  return (
    <div className="app-shell">
      <div className="app-content">
        {/* Top Bar */}
        <div className="page-header">
          <div className="page-title">{room?.name || 'Room'}</div>
          <div className="avatar-row">
            {room?.members.filter(m => m.status === 'ACTIVE').slice(0, 5).map((m, i) => (
              <div key={m.userId} className="avatar avatar-xs" style={{ background: getAvatarColor(i) }}>
                {m.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {/* Hero Card */}
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 10 }}>
            Your balance
          </div>
          <div className="amount-lg" style={{ color: isSettled ? 'var(--text-tertiary)' : isPositive ? 'var(--green)' : 'var(--red)' }}>
            {isSettled ? (
              <>₹0</>
            ) : (
              <>
                <span className="currency">{isPositive ? '+' : '-'}₹</span>
                {formatPaiseAmount(myOutstanding)}
              </>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 15, color: 'var(--text-secondary)' }}>
            {isSettled ? (
              "You're all settled up ✓"
            ) : isPositive ? (
              <>You should <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>receive {formatPaise(myOutstanding)}</strong> from the room</>
            ) : (
              <>You owe <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatPaise(Math.abs(myOutstanding))}</strong> to the room</>
            )}
          </div>

          <div className="divider" style={{ margin: '22px 0 18px' }} />

          <button className="btn-primary" onClick={() => navigate(`/rooms/${roomId}/add-expense`)}>
            <span style={{ fontSize: 18, fontWeight: 800 }}>+</span> Add expense
          </button>
        </div>

        {/* Settle Up Section */}
        {mySuggestions.length > 0 && (
          <div className="section">
            <div className="section-title">
              <span>Settle up</span>
            </div>
            <div className="section-sub">
              {mySuggestions.filter(s => s.toUserId === user?.id).length > 0
                ? `${mySuggestions.filter(s => s.toUserId === user?.id).length} people owe you`
                : `You owe ${mySuggestions.filter(s => s.fromUserId === user?.id).length} people`
              }
            </div>

            <div className="card-flat">
              {mySuggestions.map((s, i) => {
                const otherUserId = s.fromUserId === user?.id ? s.toUserId : s.fromUserId;
                const iReceive = s.toUserId === user?.id;
                return (
                  <div key={i} className="list-row" style={{ padding: '16px 18px' }}>
                    <div className="list-row-left">
                      <div className="avatar" style={{ background: getAvatarColor(getColorIdx(otherUserId)) }}>
                        {getName(otherUserId).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{getName(otherUserId)}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 1 }}>
                          {iReceive ? 'owes you' : 'you owe'}
                        </div>
                      </div>
                    </div>
                    <div className="list-row-right">
                      <div className="amount" style={{ fontSize: 17, color: iReceive ? 'var(--green)' : 'var(--red)' }}>
                        {formatPaise(s.amountPaise)}
                      </div>
                      <button className="btn-small" onClick={() => navigate(`/rooms/${roomId}/settle`, {
                        state: { suggestion: s }
                      })}>
                        {iReceive ? 'Remind' : 'Pay'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Room Activity (Other Members) */}
        <div className="section">
          <div className="section-title">
            <span>Room activity</span>
            <Link to={`/rooms/${roomId}/history`} className="link" style={{ color: 'var(--green)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              See all
            </Link>
          </div>

          {otherBalances.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-state-text">No other members yet.</div>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              {otherBalances.map(b => (
                <div key={b.userId} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 2px', borderBottom: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar avatar-sm" style={{ background: getAvatarColor(getColorIdx(b.userId)) }}>
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{b.name}</span>
                  </div>
                  <span className="amount" style={{
                    fontSize: 14, fontWeight: 600,
                    color: b.outstandingPaise > 0 ? 'var(--green)' : b.outstandingPaise < 0 ? 'var(--red)' : 'var(--text-tertiary)',
                  }}>
                    {b.outstandingPaise === 0
                      ? 'settled'
                      : b.outstandingPaise > 0
                        ? `receives ${formatPaise(b.outstandingPaise)}`
                        : `pays ${formatPaise(Math.abs(b.outstandingPaise))}`
                    }
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 4 }} />
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <Link to={`/rooms/${roomId}`} className="nav-item active">
          <div className="nav-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 12l9-9 9 9h-3v9h-4v-6h-4v6H6v-9H3z"/></svg>
          </div>
          Home
        </Link>
        <Link to={`/rooms/${roomId}/history`} className="nav-item">
          <div className="nav-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </div>
          History
        </Link>
        <Link to={`/rooms/${roomId}/settle`} className="nav-item">
          <div className="nav-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
          </div>
          Settle
        </Link>
        <Link to={`/rooms/${roomId}/settings`} className="nav-item">
          <div className="nav-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
          </div>
          Room
        </Link>
      </nav>
    </div>
  );
}
