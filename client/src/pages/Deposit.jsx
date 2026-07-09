import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const paymentMethods = [
  { id: 'crypto', label: 'Cryptocurrency', icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z', recommended: true },
  { id: 'gift_card', label: 'Gift Card', icon: 'M19 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V2.25m0 2.625h2.625A2.625 2.625 0 1112 4.875z', recommended: true },
]

export default function Deposit() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [pendingDeposits, setPendingDeposits] = useState([])
  const [amount, setAmount] = useState('')
  const [selectedMethod, setSelectedMethod] = useState('crypto')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    const uid = token || user?.id
    if (uid) {
      fetch(`/api/users/${uid}`).then(r => { if (!r.ok) throw new Error('Not found'); return r.json() }).then(p => { setProfile(p) }).catch(() => { logout(); navigate('/login') })
      fetch(`/api/users/${uid}/deposits?status=pending`).then(r => r.json()).then(setPendingDeposits).catch(() => {})
    }
  }, [user, navigate, token, logout])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return
    setError('')
    setLoading(true)
    const uid = token || user?.id
    try {
      const res = await fetch(`/api/users/${uid}/wallet`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), paymentMethod: selectedMethod })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Request failed. Please try again.')
        return
      }
      const data = await res.json()
      if (data.depositId) {
        if (selectedMethod === 'crypto') navigate(`/crypto-payment/${data.depositId}`)
        else if (selectedMethod === 'gift_card') navigate(`/gift-card-payment/${data.depositId}`)
        else setConfirmed(true)
      } else setConfirmed(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-horizon-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const stepLabels = selectedMethod === 'crypto' ? ['Enter Amount', 'Select Crypto', 'Send Payment', 'Admin Approval'] : ['Enter Amount', 'Select Method', 'Send Gift Card', 'Admin Approval']

  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8 animate-fade-in">
          <p className="text-horizon-600 dark:text-horizon-400 text-sm uppercase tracking-[0.2em] font-medium">Fund Your Account</p>
          <h1 className="section-title mt-2">Deposit</h1>
        </div>

        <div className="glass-card p-6 mb-6 animate-slide-up">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Current Balance</p>
          <p className="text-3xl font-bold text-horizon-600">${(profile.walletBalance || 0).toFixed(2)}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 animate-slide-up">
          <div className="glass-card p-6">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wider">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-medium">$</span>
              <input
                type="number"
                step="0.01"
                min="1"
                placeholder="0.00"
                className="input-field pl-8 text-lg font-semibold"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="glass-card p-6">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider">Payment Method</label>
            <div className="space-y-3">
              {paymentMethods.map(method => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedMethod(method.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    selectedMethod === method.id
                      ? 'border-horizon-500 bg-horizon-50 dark:bg-horizon-900/20'
                      : 'border-gray-200 dark:border-midnight-700 hover:border-gray-300 dark:hover:border-midnight-600'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedMethod === method.id
                      ? 'bg-horizon-600 text-white'
                      : 'bg-gray-100 dark:bg-midnight-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={method.icon} />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-medium ${selectedMethod === method.id ? 'text-midnight-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{method.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{method.id === 'crypto' ? 'BTC, ETH, or USDT. Fast & secure.' : 'Code or image upload. Quick review.'}</p>
                  </div>
                  {method.recommended && (
                    <span className="badge-success text-[10px]">Recommended</span>
                  )}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedMethod === method.id ? 'border-horizon-600' : 'border-gray-300 dark:border-midnight-600'
                  }`}>
                    {selectedMethod === method.id && <div className="w-2.5 h-2.5 rounded-full bg-horizon-600" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm uppercase tracking-wider btn-pulse">
            {loading ? 'Processing...' : `Deposit ${amount ? `$${parseFloat(amount || 0).toFixed(2)}` : ''}`}
          </button>
        </form>

        {pendingDeposits.length > 0 && (
          <div className="glass-card p-6 mt-8">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Pending Deposits</h3>
            <div className="space-y-3">
              {pendingDeposits.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-midnight-900 dark:text-white">${Number(d.amount).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{d.paymentMethod} &middot; {new Date(d.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">{d.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
