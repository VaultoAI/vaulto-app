/**
 * Transaction Modal Component
 * Shows confirmation dialog and transaction status
 */

import { useMemo } from 'react';

// Transaction status types
export const TX_STATUS = {
  IDLE: 'idle',
  AWAITING_SIGNATURE: 'awaiting_signature',
  PENDING: 'pending',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
  ERROR: 'error',
};

export function TransactionModal({
  isOpen,
  onClose,
  onConfirm,
  status = TX_STATUS.IDLE,
  type = 'buy', // 'buy' | 'sell' | 'approve'
  orders = [],
  totalCost = 0,
  error = null,
  txHash = null,
}) {
  if (!isOpen) return null;

  const isLong = type === 'buy' && orders[0]?.positionType === 'long';
  const positionLabel = isLong ? 'LONG' : 'SHORT';

  const statusDisplay = useMemo(() => {
    switch (status) {
      case TX_STATUS.AWAITING_SIGNATURE:
        return {
          title: 'Awaiting Signature',
          message: 'Please sign the transaction in your wallet',
          icon: '🔐',
          showSpinner: true,
        };
      case TX_STATUS.PENDING:
        return {
          title: 'Processing Order',
          message: 'Your order is being processed...',
          icon: '⏳',
          showSpinner: true,
        };
      case TX_STATUS.CONFIRMING:
        return {
          title: 'Confirming',
          message: 'Waiting for confirmation...',
          icon: '⏳',
          showSpinner: true,
        };
      case TX_STATUS.SUCCESS:
        return {
          title: 'Success!',
          message: 'Your order has been executed',
          icon: '✓',
          showSpinner: false,
        };
      case TX_STATUS.ERROR:
        return {
          title: 'Error',
          message: error?.message || 'Transaction failed',
          icon: '✕',
          showSpinner: false,
        };
      default:
        return {
          title: 'Confirm Order',
          message: '',
          icon: '',
          showSpinner: false,
        };
    }
  }, [status, error]);

  const canConfirm = status === TX_STATUS.IDLE;
  const canClose = status === TX_STATUS.IDLE || status === TX_STATUS.SUCCESS || status === TX_STATUS.ERROR;

  return (
    <div className="modal-overlay" onClick={canClose ? onClose : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h3 className="modal-title">
            {status === TX_STATUS.IDLE
              ? `Confirm ${type === 'buy' ? 'Buy' : type === 'sell' ? 'Sell' : 'Approval'}`
              : statusDisplay.title}
          </h3>
          {canClose && (
            <button className="modal-close" onClick={onClose}>
              &times;
            </button>
          )}
        </div>

        {/* Status indicator */}
        {status !== TX_STATUS.IDLE && (
          <div className={`modal-status status-${status}`}>
            {statusDisplay.showSpinner ? (
              <div className="spinner" />
            ) : (
              <span className="status-icon">{statusDisplay.icon}</span>
            )}
            <p className="status-message">{statusDisplay.message}</p>
          </div>
        )}

        {/* Order details - only show when idle */}
        {status === TX_STATUS.IDLE && type !== 'approve' && (
          <div className="modal-body">
            <div className="order-summary">
              <div className={`position-badge ${isLong ? 'badge-long' : 'badge-short'}`}>
                {positionLabel}
              </div>

              {orders.length > 0 && (
                <div className="order-details">
                  <h4>Order Breakdown</h4>
                  <div className="order-table">
                    <div className="order-row order-header">
                      <span>Band</span>
                      <span>Size</span>
                      <span>Price</span>
                      <span>Cost</span>
                    </div>
                    {orders.map((order, i) => (
                      <div key={i} className="order-row">
                        <span>{order.label || `Band ${i}`}</span>
                        <span>{order.size?.toFixed(4)}</span>
                        <span>${order.price?.toFixed(4)}</span>
                        <span>${(order.size * order.price)?.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="total-row">
                <span>Total Cost</span>
                <span className="total-value">${totalCost.toFixed(2)} USDC</span>
              </div>
            </div>
          </div>
        )}

        {/* Approval content */}
        {status === TX_STATUS.IDLE && type === 'approve' && (
          <div className="modal-body">
            <p className="approval-message">
              You need to approve USDC spending before trading.
              This is a one-time approval.
            </p>
          </div>
        )}

        {/* Transaction hash link */}
        {txHash && (
          <div className="tx-link">
            <a
              href={`https://polygonscan.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on PolygonScan
            </a>
          </div>
        )}

        {/* Error details */}
        {status === TX_STATUS.ERROR && error && (
          <div className="error-details">
            <p className="error-message">{error.message || 'An error occurred'}</p>
            {error.shortMessage && (
              <p className="error-short">{error.shortMessage}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          {canClose && (
            <button className="btn-secondary" onClick={onClose}>
              {status === TX_STATUS.SUCCESS ? 'Done' : 'Cancel'}
            </button>
          )}
          {canConfirm && (
            <button
              className={`btn-primary ${isLong ? 'btn-long' : 'btn-short'}`}
              onClick={onConfirm}
            >
              {type === 'approve' ? 'Approve USDC' : 'Confirm Order'}
            </button>
          )}
          {status === TX_STATUS.ERROR && (
            <button className="btn-primary" onClick={onConfirm}>
              Retry
            </button>
          )}
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .modal-content {
          background: var(--bg-surface, #1a1a2e);
          border-radius: 16px;
          width: 90%;
          max-width: 420px;
          max-height: 90vh;
          overflow-y: auto;
          border: 1px solid var(--border, rgba(255,255,255,0.1));
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
        }

        .modal-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .modal-close {
          background: none;
          border: none;
          color: var(--text-secondary, #888);
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }

        .modal-close:hover {
          color: var(--text, #fff);
        }

        .modal-status {
          padding: 32px 24px;
          text-align: center;
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 3px solid var(--border, rgba(255,255,255,0.1));
          border-top-color: var(--blue, #2952CC);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .status-icon {
          display: block;
          font-size: 48px;
          margin-bottom: 16px;
        }

        .status-success .status-icon {
          color: var(--green, #1A7D46);
        }

        .status-error .status-icon {
          color: var(--red, #C4342D);
        }

        .status-message {
          color: var(--text-secondary, #888);
          margin: 0;
        }

        .modal-body {
          padding: 24px;
        }

        .order-summary {
          background: var(--bg-muted, rgba(255,255,255,0.05));
          border-radius: 12px;
          padding: 20px;
        }

        .position-badge {
          display: inline-block;
          padding: 6px 16px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .badge-long {
          background: var(--blue-mid, rgba(41,82,204,0.2));
          color: var(--blue, #2952CC);
        }

        .badge-short {
          background: var(--red-mid, rgba(196,52,45,0.2));
          color: var(--red, #C4342D);
        }

        .order-details h4 {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary, #888);
          margin: 0 0 12px;
        }

        .order-table {
          font-size: 13px;
        }

        .order-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 8px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
        }

        .order-row.order-header {
          font-weight: 500;
          color: var(--text-secondary, #888);
          font-size: 11px;
          text-transform: uppercase;
        }

        .order-row:last-child {
          border-bottom: none;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border, rgba(255,255,255,0.1));
          font-weight: 600;
        }

        .total-value {
          font-size: 18px;
          color: var(--blue, #2952CC);
        }

        .approval-message {
          text-align: center;
          color: var(--text-secondary, #888);
          line-height: 1.6;
        }

        .tx-link {
          text-align: center;
          padding: 16px;
        }

        .tx-link a {
          color: var(--blue, #2952CC);
          text-decoration: none;
          font-size: 14px;
        }

        .tx-link a:hover {
          text-decoration: underline;
        }

        .error-details {
          padding: 16px 24px;
          background: var(--red-mid, rgba(196,52,45,0.1));
          margin: 0 24px;
          border-radius: 8px;
        }

        .error-message {
          color: var(--red, #C4342D);
          margin: 0;
          font-size: 14px;
        }

        .error-short {
          color: var(--text-secondary, #888);
          margin: 8px 0 0;
          font-size: 12px;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          padding: 20px 24px;
          border-top: 1px solid var(--border, rgba(255,255,255,0.1));
        }

        .modal-actions button {
          flex: 1;
          padding: 14px 20px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border, rgba(255,255,255,0.2));
          color: var(--text, #fff);
        }

        .btn-secondary:hover {
          background: var(--bg-muted, rgba(255,255,255,0.05));
        }

        .btn-primary {
          border: none;
          color: white;
        }

        .btn-primary.btn-long {
          background: var(--blue, #2952CC);
        }

        .btn-primary.btn-short {
          background: var(--red, #C4342D);
        }

        .btn-primary:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
