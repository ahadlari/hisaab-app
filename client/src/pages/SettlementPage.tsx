import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import * as imageConversion from 'image-conversion';
import posthog from 'posthog-js';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRoomBalances } from '../hooks/useRoomBalances';
import { settlementApi } from '../api/settlement.api';
import { roomApi } from '../api/room.api';
import { formatPaise } from '../utils/currency.util';
import { supabase } from '../config/supabase';
import type { RoomMember, Settlement } from '../types';

const AVATAR_COLORS = ['#30D158', '#64D2FF', '#FF9F0A', '#BF5AF2', '#FFD60A'];

export default function SettlementPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: balancesData, refetch: refetchBalances } = useRoomBalances(roomId);

  const [members, setMembers] = useState<RoomMember[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);

  const suggestion = (location.state as any)?.suggestion;

  useEffect(() => {
    if (!roomId) return;
    roomApi.getDetails(roomId).then(res => {
      setMembers(res.data.members.filter(m => m.status === 'ACTIVE'));
    });
    // Fetch all settlements (PENDING and CONFIRMED)
    settlementApi.list(roomId).then(res => setSettlements(res.data));
  }, [roomId]);

  useEffect(() => {
    if (suggestion) {
      setFromUserId(suggestion.fromUserId);
      setToUserId(suggestion.toUserId);
      setAmount(String(suggestion.amountPaise / 100));
      setShowManual(true);
      posthog.capture('settlement_suggestion_used');
    }
  }, [suggestion]);

  const getName = (userId: string) => members.find(m => m.userId === userId)?.name || 'Unknown';
  const getUpiId = (userId: string) => members.find(m => m.userId === userId)?.upiId;
  const getColorIdx = (userId: string) => members.findIndex(m => m.userId === userId);

  const handleSettle = async () => {
    setError('');
    setWarning('');
    const amountPaise = Math.round(parseFloat(amount) * 100);
    if (!fromUserId || !toUserId) { setError('Select both payer and receiver'); return; }
    if (fromUserId === toUserId) { setError('Payer and receiver must be different'); return; }
    if (amountPaise <= 0) { setError('Amount must be greater than ₹0'); return; }
    if (amountPaise > 10000000) { setError('Amount seems too large. Please check.'); return; }
    
    if (paymentMethod !== 'CASH' && !proofFile) {
      setError('Please upload a screenshot for verification.');
      return;
    }

    setLoading(true);
    try {
      let proofUrl: string | undefined;

      if (proofFile) {
        // Compress image to ~500kb
        const compressed = await imageConversion.compressAccurately(proofFile, 500);
        const fileName = `proofs/${roomId}/${Date.now()}.jpg`;
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('settlement-proofs')
          .upload(fileName, compressed, { contentType: 'image/jpeg' });
        
        if (uploadError) throw new Error('Failed to upload screenshot: ' + uploadError.message);
        
        // Get public URL
        const { data: publicData } = supabase.storage
          .from('settlement-proofs')
          .getPublicUrl(fileName);
          
        proofUrl = publicData.publicUrl;
      }

      const res = await settlementApi.create(roomId!, {
        fromUserId,
        toUserId,
        amountPaise,
        paymentMethod,
        proofUrl,
        note: note || undefined,
      });

      posthog.capture('settlement_recorded', {
        paymentMethod: paymentMethod,
        isCash: paymentMethod === 'CASH'
      });

      if (res.warning) setWarning(res.warning);
      showToast('Payment request sent for verification!', 'success');
      setShowManual(false);
      setAmount('');
      setNote('');
      setProofFile(null);
      refetchBalances();
      settlementApi.list(roomId!).then(r => setSettlements(r.data));
    } catch (err: any) {
      setError(err.message || 'Failed to record settlement');
    }
    setLoading(false);
  };

  const handleVerify = async (settlementId: string, status: 'CONFIRMED' | 'REJECTED') => {
    try {
      await settlementApi.verify(roomId!, settlementId, { status });
      showToast(`Payment ${status.toLowerCase()}`, 'success');
      refetchBalances();
      settlementApi.list(roomId!).then(r => setSettlements(r.data));
    } catch (err: any) {
      showToast(err.message || 'Failed to verify payment', 'error');
    }
  };

  const pendingApprovals = settlements.filter(s => s.status === 'PENDING' && s.toUserId === user?.id);
  const pendingSent = settlements.filter(s => s.status === 'PENDING' && s.fromUserId === user?.id);
  const history = settlements.filter(s => s.status === 'CONFIRMED');

  const receiverUpi = getUpiId(toUserId);
  const receiverName = getName(toUserId);
  const upiLink = receiverUpi && amount 
    ? `upi://pay?pa=${receiverUpi}&pn=${encodeURIComponent(receiverName)}&am=${amount}&cu=INR&tn=Hisaab%20Settlement` 
    : '';

  return (
    <div className="app-shell">
      <div className="app-content">
        <div className="page-header">
          <button className="back-btn" aria-label="Go back" onClick={() => navigate(`/rooms/${roomId}`)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="page-title">Settle Up</h1>
          <button className="btn-small" onClick={() => setShowManual(!showManual)}>
            {showManual ? 'Cancel' : '+ Manual'}
          </button>
        </div>

        {warning && (
          <div className="toast toast-warning" style={{ position: 'relative', margin: '8px 20px', animation: 'none' }}>
            ⚠️ {warning}
          </div>
        )}

        {/* Pending Approvals (Receiver) */}
        {pendingApprovals.length > 0 && (
          <div className="section">
            <div className="section-title"><span style={{ color: 'var(--orange)' }}>Pending Approvals</span></div>
            <div className="card-flat" style={{ border: '1px solid var(--orange)' }}>
              {pendingApprovals.map(s => (
                <div key={s.id} style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.fromUser?.name || getName(s.fromUserId)} sent {formatPaise(s.amountPaise)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>via {s.paymentMethod}</div>
                    </div>
                    {s.proofUrl && (
                      <a href={s.proofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}>
                        View Proof
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn-primary" style={{ flex: 1, padding: 8 }} onClick={() => handleVerify(s.id, 'CONFIRMED')}>Approve</button>
                    <button className="btn-small" style={{ flex: 1, color: 'var(--red)' }} onClick={() => handleVerify(s.id, 'REJECTED')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Sent (Payer) */}
        {pendingSent.length > 0 && (
          <div className="section">
            <div className="section-title"><span>Verification Pending</span></div>
            <div className="card-flat">
              {pendingSent.map(s => (
                <div key={s.id} className="list-row">
                  <div className="list-row-left">
                    <div>
                      <div style={{ fontWeight: 500 }}>Sent to {s.toUser?.name || getName(s.toUserId)}</div>
                      <div style={{ fontSize: 12, color: 'var(--orange)' }}>Waiting for approval</div>
                    </div>
                  </div>
                  <div className="amount" style={{ fontSize: 15 }}>{formatPaise(s.amountPaise)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Settlements */}
        {!showManual && balancesData && balancesData.suggestedSettlements.length > 0 && (
          <div className="section">
            <div className="section-title"><span>Suggested</span></div>
            <div className="section-sub">Minimum transactions to settle everyone</div>
            <div className="card-flat">
              {balancesData.suggestedSettlements.map((s, i) => (
                <div key={i} className="list-row" style={{ padding: '16px 18px' }}>
                  <div className="list-row-left">
                    <div className="avatar" style={{ background: AVATAR_COLORS[getColorIdx(s.fromUserId) % AVATAR_COLORS.length] }}>
                      {getName(s.fromUserId).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {getName(s.fromUserId)} → {getName(s.toUserId)}
                      </div>
                    </div>
                  </div>
                  <div className="list-row-right">
                    <div className="amount" style={{ fontSize: 16, color: 'var(--green)' }}>
                      {formatPaise(s.amountPaise)}
                    </div>
                    <button className="btn-small" onClick={() => {
                      setFromUserId(s.fromUserId);
                      setToUserId(s.toUserId);
                      setAmount(String(s.amountPaise / 100));
                      setShowManual(true);
                    }}>
                      Settle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Settlement Form */}
        {showManual && (
          <div className="section">
            <div className="section-title"><span>Record Payment</span></div>
            <div style={{ marginTop: 12 }}>
              <div className="input-group">
                <label className="input-label">From (payer)</label>
                <select className="input-field" value={fromUserId} onChange={e => setFromUserId(e.target.value)}>
                  <option value="">Select...</option>
                  {members.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">To (receiver)</label>
                <select className="input-field" value={toUserId} onChange={e => setToUserId(e.target.value)}>
                  <option value="">Select...</option>
                  {members.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Amount</label>
                <div className="currency-input-wrapper">
                  <span className="currency-symbol">₹</span>
                  <input className="input-field" type="number" value={amount} onChange={e => setAmount(e.target.value)} step="0.01" min="0" />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Method</label>
                <div className="segment-control">
                  {['UPI', 'CASH', 'CARD', 'OTHER'].map(m => (
                    <button key={m} className={`segment-btn ${paymentMethod === m ? 'active' : ''}`} onClick={() => setPaymentMethod(m)}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* UPI Deep Link Button */}
              {paymentMethod === 'UPI' && upiLink && (
                <div style={{ marginBottom: 16 }}>
                  <a href={upiLink} className="btn-ghost" style={{ display: 'block', textAlign: 'center', background: 'var(--green-dim)', color: 'var(--green)' }}>
                    Pay via UPI App
                  </a>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 4 }}>
                    Only works on mobile devices
                  </p>
                </div>
              )}

              {/* Proof Upload */}
              {paymentMethod !== 'CASH' && (
                <div className="input-group">
                  <label className="input-label">Screenshot Proof (required)</label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => setProofFile(e.target.files?.[0] || null)}
                    className="input-field"
                    style={{ padding: '8px' }}
                  />
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Note (optional)</label>
                <input className="input-field" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Paid via Google Pay" />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <button className="btn-primary" onClick={handleSettle} disabled={loading}>
                {loading ? <span className="loading-spinner" /> : 'Mark as Paid & Request Approval'}
              </button>
            </div>
          </div>
        )}

        {/* Past Settlements */}
        {history.length > 0 && (
          <div className="section">
            <div className="section-title"><span>History</span></div>
            <div className="card-flat" style={{ marginTop: 12 }}>
              {history.map(s => (
                <div key={s.id} className="list-row">
                  <div className="list-row-left">
                    <div className="avatar avatar-sm" style={{ background: AVATAR_COLORS[getColorIdx(s.fromUserId) % AVATAR_COLORS.length] }}>
                      {(s.fromUser?.name || getName(s.fromUserId)).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>
                        {s.fromUser?.name || getName(s.fromUserId)} → {s.toUser?.name || getName(s.toUserId)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {s.paymentMethod}
                      </div>
                    </div>
                  </div>
                  <div className="amount" style={{ fontSize: 15 }}>{formatPaise(s.amountPaise)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
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
        <Link to={`/rooms/${roomId}/settle`} className="nav-item active">
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
