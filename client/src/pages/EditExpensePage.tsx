import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { expenseApi } from '../api/expense.api';
import { roomApi } from '../api/room.api';
import { rupeesToPaise, formatPaise } from '../utils/currency.util';
import type { RoomMember, Category, Expense } from '../types';

const SPLIT_TYPES = [
  { key: 'EQUAL', label: 'Equal' },
  { key: 'CUSTOM_AMOUNT', label: 'Custom' },
  { key: 'PERCENTAGE', label: '%' },
  { key: 'SHARE_BASED', label: 'Shares' },
] as const;

export default function EditExpensePage() {
  const { roomId, expenseId } = useParams<{ roomId: string; expenseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [members, setMembers] = useState<RoomMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [originalExpense, setOriginalExpense] = useState<Expense | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState<string>('EQUAL');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [shareUnits, setShareUnits] = useState<Record<string, string>>({});
  const [payerId, setPayerId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // Load room data & existing expense
  useEffect(() => {
    if (!roomId || !expenseId) return;
    Promise.all([
      roomApi.getDetails(roomId),
      roomApi.getCategories(roomId),
      expenseApi.getById(roomId, expenseId),
    ]).then(([roomRes, catRes, expRes]) => {
      const activeMembers = roomRes.data.members.filter(m => m.status === 'ACTIVE');
      setMembers(activeMembers);
      setCategories(catRes.data);

      const exp = expRes.data;
      setOriginalExpense(exp);

      // Pre-fill form from existing expense
      setDescription(exp.description);
      setAmount(String(Number(exp.amountPaise) / 100));
      setSplitType(exp.splitType);
      setCategoryId(exp.category?.id || '');
      setSelectedParticipants(exp.participants.map(p => p.userId));

      // Set payer from first payment
      if (exp.payments.length > 0) {
        setPayerId(exp.payments[0].payerId);
      }

      // Pre-fill split-specific fields
      if (exp.splitType === 'CUSTOM_AMOUNT') {
        const customs: Record<string, string> = {};
        exp.participants.forEach(p => {
          customs[p.userId] = String(Number(p.shareAmountPaise) / 100);
        });
        setCustomAmounts(customs);
        setShowAdvanced(true);
      } else if (exp.splitType === 'PERCENTAGE') {
        const pcts: Record<string, string> = {};
        exp.participants.forEach(p => {
          if (p.percentage != null) pcts[p.userId] = String(p.percentage);
        });
        setPercentages(pcts);
        setShowAdvanced(true);
      } else if (exp.splitType === 'SHARE_BASED') {
        const shares: Record<string, string> = {};
        exp.participants.forEach(p => {
          if (p.shareUnits != null) shares[p.userId] = String(p.shareUnits);
        });
        setShareUnits(shares);
        setShowAdvanced(true);
      }
      if (exp.splitType !== 'EQUAL') setShowAdvanced(true);

      setPageLoading(false);
    }).catch(() => {
      setError('Failed to load expense');
      setPageLoading(false);
    });
  }, [roomId, expenseId]);

  const amountPaise = rupeesToPaise(parseFloat(amount) || 0);

  const toggleParticipant = (userId: string) => {
    setSelectedParticipants(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async () => {
    setError('');
    if (!description.trim()) { setError('Description is required'); return; }
    if (amountPaise <= 0) { setError('Amount must be greater than ₹0'); return; }
    if (selectedParticipants.length === 0) { setError('Select at least one participant'); return; }

    // Validate split-specific constraints
    if (splitType === 'CUSTOM_AMOUNT') {
      const sum = selectedParticipants.reduce((s, id) => s + rupeesToPaise(parseFloat(customAmounts[id] || '0')), 0);
      if (sum !== amountPaise) {
        setError(`Custom amounts must add up to ₹${(amountPaise / 100).toFixed(2)} (currently ₹${(sum / 100).toFixed(2)})`);
        return;
      }
    } else if (splitType === 'PERCENTAGE') {
      const sum = selectedParticipants.reduce((s, id) => s + parseFloat(percentages[id] || '0'), 0);
      if (Math.abs(100 - sum) > 0.01) {
        setError(`Percentages must add up to 100% (currently ${sum.toFixed(2)}%)`);
        return;
      }
    } else if (splitType === 'SHARE_BASED') {
      const totalShares = selectedParticipants.reduce((s, id) => s + parseInt(shareUnits[id] || '0'), 0);
      if (totalShares <= 0) {
        setError('At least one person must have shares');
        return;
      }
    }

    let participants: any[] = [];
    switch (splitType) {
      case 'EQUAL':
        participants = selectedParticipants.map(userId => ({ userId }));
        break;
      case 'CUSTOM_AMOUNT':
        participants = selectedParticipants.map(userId => ({
          userId,
          customAmountPaise: rupeesToPaise(parseFloat(customAmounts[userId] || '0')),
        }));
        break;
      case 'PERCENTAGE':
        participants = selectedParticipants.map(userId => ({
          userId,
          percentage: parseFloat(percentages[userId] || '0'),
        }));
        break;
      case 'SHARE_BASED':
        participants = selectedParticipants.map(userId => ({
          userId,
          shareUnits: parseInt(shareUnits[userId] || '1'),
        }));
        break;
    }

    setLoading(true);
    try {
      await expenseApi.edit(roomId!, expenseId!, {
        description: description.trim(),
        amountPaise,
        categoryId: categoryId || null,
        splitType,
        payments: [{ payerId, amountPaise, paymentMethod: 'OTHER' }],
        participants,
      });
      posthog.capture('expense_edited', { splitType: splitType });
      showToast('Expense updated!', 'success');
      navigate(`/rooms/${roomId}/expenses/${expenseId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update expense');
    }
    setLoading(false);
  };

  const getName = (userId: string) => members.find(m => m.userId === userId)?.name || 'Unknown';

  // Validation feedback for custom/percentage splits
  let splitValidation = '';
  if (splitType === 'CUSTOM_AMOUNT') {
    const sum = selectedParticipants.reduce((s, id) => s + rupeesToPaise(parseFloat(customAmounts[id] || '0')), 0);
    const diff = amountPaise - sum;
    if (diff > 0) splitValidation = `₹${(diff / 100).toFixed(2)} left to assign`;
    else if (diff < 0) splitValidation = `₹${(Math.abs(diff) / 100).toFixed(2)} over-assigned`;
  } else if (splitType === 'PERCENTAGE') {
    const sum = selectedParticipants.reduce((s, id) => s + parseFloat(percentages[id] || '0'), 0);
    const diff = 100 - sum;
    if (Math.abs(diff) > 0.01) splitValidation = `${diff.toFixed(2)}% remaining`;
  }

  if (pageLoading) {
    return (
      <div className="app-shell">
        <div className="app-content">
          <div className="page-header">
            <button className="back-btn" aria-label="Go back" onClick={() => navigate(-1)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <h1 className="page-title">Edit Expense</h1>
            <div style={{ width: 36 }} />
          </div>
          <div style={{ padding: '20px' }}>
            <div className="skeleton" style={{ height: 48, marginBottom: 16, borderRadius: 'var(--radius-md)' }} />
            <div className="skeleton" style={{ height: 48, marginBottom: 16, borderRadius: 'var(--radius-md)' }} />
            <div className="skeleton" style={{ height: 48, marginBottom: 16, borderRadius: 'var(--radius-md)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!originalExpense) {
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

  return (
    <div className="app-shell">
      <div className="app-content">
        <div className="page-header">
          <button className="back-btn" aria-label="Go back" onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="page-title">Edit Expense</h1>
          <div style={{ width: 36 }} />
        </div>

        <div style={{ padding: '12px 20px' }}>
          {/* Amount */}
          <div className="input-group">
            <div className="currency-input-wrapper">
              <span className="currency-symbol">₹</span>
              <input
                className="input-field"
                type="number"
                placeholder="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Description */}
          <div className="input-group">
            <label className="input-label">What's this for?</label>
            <input
              className="input-field"
              placeholder="e.g. Grocery, Milk, Gas..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Paid by */}
          <div className="input-group">
            <label className="input-label">Paid by</label>
            <select
              className="input-field"
              value={payerId}
              onChange={e => setPayerId(e.target.value)}
              style={{ appearance: 'none' }}
            >
              {members.map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.name} {m.userId === user?.id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Participants */}
          <div className="input-group">
            <label className="input-label">For whom</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {members.map(m => (
                <button
                  key={m.userId}
                  className={`chip ${selectedParticipants.includes(m.userId) ? 'active' : ''}`}
                  onClick={() => toggleParticipant(m.userId)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Toggle */}
          <button
            className="btn-ghost"
            style={{ width: '100%', marginBottom: 16 }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▾ Hide advanced' : '▸ Advanced options'}
          </button>

          {showAdvanced && (
            <>
              {/* Split Type */}
              <div className="input-group">
                <label className="input-label">Split type</label>
                <div className="segment-control">
                  {SPLIT_TYPES.map(st => (
                    <button
                      key={st.key}
                      className={`segment-btn ${splitType === st.key ? 'active' : ''}`}
                      onClick={() => setSplitType(st.key)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split inputs */}
              {splitType === 'CUSTOM_AMOUNT' && selectedParticipants.map(id => (
                <div key={id} className="input-group" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, minWidth: 80 }}>{getName(id)}</span>
                    <div className="currency-input-wrapper" style={{ flex: 1 }}>
                      <span className="currency-symbol" style={{ fontSize: 14 }}>₹</span>
                      <input
                        className="input-field"
                        type="number"
                        placeholder="0"
                        value={customAmounts[id] || ''}
                        onChange={e => setCustomAmounts({ ...customAmounts, [id]: e.target.value })}
                        style={{ fontSize: 16, fontWeight: 600, padding: '10px 10px 10px 32px' }}
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {splitType === 'PERCENTAGE' && selectedParticipants.map(id => (
                <div key={id} className="input-group" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, minWidth: 80 }}>{getName(id)}</span>
                    <input
                      className="input-field"
                      type="number"
                      placeholder="0"
                      value={percentages[id] || ''}
                      onChange={e => setPercentages({ ...percentages, [id]: e.target.value })}
                      style={{ fontSize: 16, fontWeight: 600, flex: 1, padding: '10px 16px' }}
                      step="0.01"
                      min="0"
                      max="100"
                    />
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>%</span>
                  </div>
                </div>
              ))}

              {splitType === 'SHARE_BASED' && selectedParticipants.map(id => (
                <div key={id} className="input-group" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, minWidth: 80 }}>{getName(id)}</span>
                    <input
                      className="input-field"
                      type="number"
                      placeholder="1"
                      value={shareUnits[id] || ''}
                      onChange={e => setShareUnits({ ...shareUnits, [id]: e.target.value })}
                      style={{ fontSize: 16, fontWeight: 600, flex: 1, padding: '10px 16px' }}
                      min="0"
                    />
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 13 }}>shares</span>
                  </div>
                </div>
              ))}

              {splitValidation && (
                <p style={{ fontSize: 13, color: 'var(--orange)', marginBottom: 16, fontWeight: 500 }}>
                  {splitValidation}
                </p>
              )}

              {/* Category */}
              <div className="input-group">
                <label className="input-label">Category</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    className={`chip ${!categoryId ? 'active' : ''}`}
                    onClick={() => setCategoryId('')}
                  >None</button>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      className={`chip ${categoryId === c.id ? 'active' : ''}`}
                      onClick={() => setCategoryId(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || amountPaise <= 0}
            style={{ marginTop: 8 }}
          >
            {loading ? <span className="loading-spinner" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
