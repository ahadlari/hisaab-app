import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { expenseApi } from '../api/expense.api';
import { formatPaise } from '../utils/currency.util';
import type { Expense } from '../types';

const AVATAR_COLORS = ['#30D158', '#64D2FF', '#FF9F0A', '#BF5AF2', '#FFD60A'];

export default function ExpenseDetailPage() {
  const { roomId, expenseId } = useParams<{ roomId: string; expenseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');
  const [voidForce, setVoidForce] = useState(false);

  useEffect(() => {
    if (!roomId || !expenseId) return;
    expenseApi.getById(roomId, expenseId).then(res => {
      setExpense(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [roomId, expenseId]);

  const handleVoid = async () => {
    if (!roomId || !expenseId) return;
    try {
      await expenseApi.void(roomId, expenseId, voidReason || undefined, voidForce);
      posthog.capture('expense_voided');
      showToast('Expense voided', 'success');
      navigate(`/rooms/${roomId}/history`);
    } catch (err: any) {
      if (err.code === 'EXPENSE_HAS_LATER_SETTLEMENTS') {
        setVoidError(err.message);
        setVoidForce(true);
      } else {
        setVoidError(err.message || 'Failed to void expense');
      }
    }
  };

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-content">
          <div className="page-header">
            <button className="back-btn" aria-label="Go back" onClick={() => navigate(-1)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <h1 className="page-title">Expense</h1>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ padding: '20px' }}>
            <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-xl)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="app-shell">
        <div className="app-content">
          <div className="empty-state">
            <div className="empty-state-title">Expense not found</div>
            <button className="btn-primary" style={{ maxWidth: 200, margin: '16px auto' }} onClick={() => navigate(-1)}>Go back</button>
          </div>
        </div>
      </div>
    );
  }

  const isVoided = expense.status === 'VOIDED';

  return (
    <div className="app-shell">
      <div className="app-content">
        <div className="page-header">
          <button className="back-btn" aria-label="Go back" onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="page-title">Expense Detail</h1>
          <div style={{ width: 36 }} />
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{expense.description}</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {expense.category?.name || 'Uncategorized'} · {expense.splitType.replace('_', ' ')}
              </div>
            </div>
            <div>
              <span className={`badge ${isVoided ? 'badge-voided' : 'badge-active'}`}>
                {expense.status}
              </span>
            </div>
          </div>

          <div className="amount-lg" style={{
            marginTop: 16,
            color: isVoided ? 'var(--text-tertiary)' : 'var(--text-primary)',
            textDecoration: isVoided ? 'line-through' : 'none',
            fontSize: 36,
          }}>
            {formatPaise(Number(expense.amountPaise))}
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
            {new Date(expense.expenseDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* Payments */}
        <div className="section">
          <div className="section-title"><span>Paid by</span></div>
          <div className="card-flat" style={{ marginTop: 12 }}>
            {expense.payments.map((p, i) => (
              <div key={p.id} className="list-row">
                <div className="list-row-left">
                  <div className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {(p.payer?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.payer?.name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{p.paymentMethod}</div>
                  </div>
                </div>
                <div className="amount" style={{ fontSize: 16 }}>{formatPaise(Number(p.amountPaise))}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Participants / Shares */}
        <div className="section">
          <div className="section-title"><span>Shares</span></div>
          <div className="card-flat" style={{ marginTop: 12 }}>
            {expense.participants.map((p, i) => (
              <div key={p.id} className="list-row">
                <div className="list-row-left">
                  <div className="avatar avatar-sm" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {(p.user?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500, fontSize: 15 }}>{p.user?.name || 'Unknown'}</span>
                </div>
                <span className="amount" style={{ fontSize: 15 }}>
                  {formatPaise(Number(p.shareAmountPaise))}
                  {p.percentage && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}> ({p.percentage}%)</span>}
                  {p.shareUnits && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}> ({p.shareUnits} shares)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        {!isVoided && (
          <div style={{ padding: '16px 20px', display: 'flex', gap: 12 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => navigate(`/rooms/${roomId}/edit-expense/${expenseId}`)}>
              Edit
            </button>
            <button className="btn-danger" style={{ flex: 1 }} onClick={() => setShowVoidModal(true)}>
              Void
            </button>
          </div>
        )}

        {/* Void Modal */}
        {showVoidModal && (
          <div className="modal-overlay" onClick={() => setShowVoidModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2 className="modal-title">Void this expense?</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                This will exclude it from all balance calculations. It won't be deleted — it'll be marked as voided.
              </p>
              <div className="input-group">
                <label className="input-label">Reason (optional)</label>
                <input
                  className="input-field"
                  placeholder="e.g. Duplicate entry"
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                />
              </div>
              {voidError && (
                <p className="error-text" style={{ marginBottom: 16 }}>
                  {voidError}
                  {voidForce && <><br /><em style={{ fontSize: 12 }}>Click "Void Anyway" to proceed.</em></>}
                </p>
              )}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowVoidModal(false)}>Cancel</button>
                <button className="btn-danger" onClick={handleVoid}>
                  {voidForce ? 'Void Anyway' : 'Void'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
