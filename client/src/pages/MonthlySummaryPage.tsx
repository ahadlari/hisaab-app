import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { roomApi } from '../api/room.api';
import { formatPaise } from '../utils/currency.util';
import type { MonthlySummary } from '../types';

export default function MonthlySummaryPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    roomApi.getMonthlySummary(roomId, month).then(res => {
      setSummary(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [roomId, month]);

  const changeMonth = (direction: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = (() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  })();

  const maxCategoryPaise = summary?.categoryBreakdown.reduce((max, c) => Math.max(max, c.totalPaise), 0) || 1;

  return (
    <div className="app-shell">
      <div className="app-content">
        <div className="page-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="page-title">Monthly Summary</h1>
          <div style={{ width: 36 }} />
        </div>

        {/* Month Selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '12px 20px' }}>
          <button className="btn-small" onClick={() => changeMonth(-1)}>←</button>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{monthLabel}</span>
          <button className="btn-small" onClick={() => changeMonth(1)}>→</button>
        </div>

        {loading ? (
          <div style={{ padding: 20 }}>
            <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-xl)' }} />
          </div>
        ) : summary ? (
          <>
            {/* Totals Card */}
            <div className="card" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>Total expenses</div>
              <div className="amount-lg" style={{ color: 'var(--text-primary)', fontSize: 36, marginTop: 8 }}>
                {formatPaise(summary.totalExpensesPaise)}
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>People</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.memberCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Categories</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{summary.categoryBreakdown.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Avg/person</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {summary.memberCount > 0 ? formatPaise(Math.round(summary.totalExpensesPaise / summary.memberCount)) : '₹0'}
                  </div>
                </div>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="section">
              <div className="section-title"><span>By Category</span></div>
              {summary.categoryBreakdown.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>No expenses this month.</p>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {summary.categoryBreakdown
                    .sort((a, b) => b.totalPaise - a.totalPaise)
                    .map((cat, i) => (
                    <div key={cat.category} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{cat.category}</span>
                        <span className="amount" style={{ fontSize: 14 }}>{formatPaise(cat.totalPaise)}</span>
                      </div>
                      <div style={{
                        height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', borderRadius: 4,
                          width: `${(cat.totalPaise / maxCategoryPaise) * 100}%`,
                          background: 'var(--green)',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Current Balances */}
            <div className="section">
              <div className="section-title"><span>Current Balances</span></div>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                All-time room balances (not month-specific)
              </p>
              <div className="card-flat">
                {summary.balancesAtMonthEnd.map(b => (
                  <div key={b.userId} className="list-row">
                    <span style={{ fontWeight: 500, fontSize: 15 }}>{b.name}</span>
                    <span className="amount" style={{
                      fontSize: 15,
                      color: b.outstandingPaise > 0 ? 'var(--green)' : b.outstandingPaise < 0 ? 'var(--red)' : 'var(--text-tertiary)',
                    }}>
                      {b.outstandingPaise === 0 ? 'Settled' : formatPaise(b.outstandingPaise)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">No data available</div>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
