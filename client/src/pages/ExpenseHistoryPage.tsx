import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { expenseApi } from '../api/expense.api';
import { formatPaise } from '../utils/currency.util';
import type { Expense } from '../types';

const AVATAR_COLORS = ['#30D158', '#64D2FF', '#FF9F0A', '#BF5AF2', '#FFD60A'];

export default function ExpenseHistoryPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    expenseApi.list(roomId, { page, status: statusFilter, pageSize: 20 }).then(res => {
      setExpenses(res.data);
      setTotal(res.meta.total);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [roomId, page, statusFilter]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `Today, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="app-shell">
      <div className="app-content">
        <div className="page-header">
          <button className="back-btn" onClick={() => navigate(`/rooms/${roomId}`)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="page-title">Expenses</h1>
          <div style={{ width: 36 }} />
        </div>

        {/* Filters */}
        <div style={{ padding: '8px 20px 12px', display: 'flex', gap: 8 }}>
          <button
            className={`chip ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('ACTIVE'); setPage(1); }}
          >Active</button>
          <button
            className={`chip ${statusFilter === 'VOIDED' ? 'active' : ''}`}
            onClick={() => { setStatusFilter('VOIDED'); setPage(1); }}
          >Voided</button>
        </div>

        {loading ? (
          <div style={{ padding: '0 20px' }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 8, borderRadius: 'var(--radius-lg)' }} />)}
          </div>
        ) : expenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">No expenses yet</div>
            <div className="empty-state-text">Add your first shared expense.</div>
          </div>
        ) : (
          <div style={{ padding: '0 20px' }}>
            {expenses.map(exp => (
              <div
                key={exp.id}
                className="card-flat"
                style={{ marginBottom: 8, cursor: 'pointer' }}
                onClick={() => navigate(`/rooms/${roomId}/expenses/${exp.id}`)}
              >
                <div className="list-row" style={{ padding: '14px 18px' }}>
                  <div className="list-row-left" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-2)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 18, flexShrink: 0,
                    }}>
                      {exp.category?.name === 'Grocery' ? '🛒' : exp.category?.name === 'Milk' ? '🥛' : exp.category?.name === 'Gas' ? '⛽' : exp.category?.name === 'Vegetables' ? '🥬' : exp.category?.name === 'Meat' ? '🍖' : '💰'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {exp.description}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Paid by {exp.payments?.[0]?.payer?.name || 'someone'} · {exp.participants?.length || 0} split
                        {exp.status === 'VOIDED' && <span className="badge badge-voided" style={{ marginLeft: 8 }}>Voided</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="amount" style={{ fontSize: 16, color: exp.status === 'VOIDED' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                      {formatPaise(Number(exp.amountPaise))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {formatDate(exp.expenseDate)}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {total > 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '16px 0' }}>
                <button className="btn-small" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 13, alignSelf: 'center' }}>
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button className="btn-small" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <Link to={`/rooms/${roomId}`} className="nav-item">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 12l9-9 9 9h-3v9h-4v-6h-4v6H6v-9H3z"/></svg></div>
          Home
        </Link>
        <Link to={`/rooms/${roomId}/history`} className="nav-item active">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></div>
          History
        </Link>
        <Link to={`/rooms/${roomId}/settle`} className="nav-item">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></div>
          Settle
        </Link>
        <Link to={`/rooms/${roomId}/settings`} className="nav-item">
          <div className="nav-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></div>
          Room
        </Link>
      </nav>
    </div>
  );
}
