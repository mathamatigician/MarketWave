import React, { useState, useEffect } from 'react';
import { Check, Zap, Shield, Crown, X, Loader2, Sparkles } from 'lucide-react';
import { API_URL } from '../config';

interface Plan {
  id: string;
  name: string;
  tagline: string;
  price_inr: number;
  amount_paise: number;
  billing: string;
  badge: string;
  popular: boolean;
  features: string[];
}

interface SubscriptionInfo {
  plan_id: string;
  plan_name: string;
  status: string;
  badge: string;
  updated_at?: string;
}

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  currentSubscription?: SubscriptionInfo | null;
  onSubscriptionSuccess: (newSub: SubscriptionInfo) => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  currentSubscription,
  onSubscriptionSuccess,
}) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeProcessingPlan, setActiveProcessingPlan] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const currentPlanId = currentSubscription?.plan_id || 'free';

  // Load plans from backend
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      fetch(`${API_URL}/api/subscription/plans`)
        .then((res) => res.json())
        .then((data) => {
          setPlans(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to fetch subscription plans:', err);
          setErrorMsg('Failed to load subscription plans. Please try again.');
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Dynamically load Razorpay checkout SDK script
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSelectPlan = async (plan: Plan) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setActiveProcessingPlan(plan.id);

    try {
      // 1. Starter (Free) plan update
      if (plan.id === 'free') {
        const res = await fetch(`${API_URL}/api/subscription/verify-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userEmail,
            plan_id: 'free',
          }),
        });
        const data = await res.json();
        if (res.ok && data.subscription) {
          setSuccessMsg('Switched to Starter Plan!');
          onSubscriptionSuccess(data.subscription);
          setTimeout(() => onClose(), 1200);
        } else {
          setErrorMsg(data.detail || 'Failed to update subscription.');
        }
        setActiveProcessingPlan(null);
        return;
      }

      // 2. Paid Plan: Load Razorpay script
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        setErrorMsg('Razorpay SDK failed to load. Check internet connection.');
        setActiveProcessingPlan(null);
        return;
      }

      // 3. Create order on backend
      const orderRes = await fetch(`${API_URL}/api/subscription/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          plan_id: plan.id,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.detail || 'Order creation failed.');
      }

      // 4. Trigger Razorpay Checkout Popup
      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'MarketWaveAI',
        description: `${orderData.plan_name} Subscription`,
        image: 'https://i.postimg.cc/hvqBYt93/newspulse.gif',
        order_id: orderData.order_id,
        handler: async function (response: any) {
          try {
            setActiveProcessingPlan(plan.id);
            const verifyRes = await fetch(`${API_URL}/api/subscription/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: userEmail,
                plan_id: plan.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.subscription) {
              setSuccessMsg(`🎉 Upgrade Successful! Welcome to ${plan.name}`);
              onSubscriptionSuccess(verifyData.subscription);
              setTimeout(() => onClose(), 1500);
            } else {
              setErrorMsg(verifyData.detail || 'Payment verification failed.');
            }
          } catch (e: any) {
            setErrorMsg(e.message || 'Payment verification failed.');
          } finally {
            setActiveProcessingPlan(null);
          }
        },
        prefill: {
          email: userEmail,
        },
        notes: {
          plan_id: plan.id,
        },
        theme: {
          color: '#00FF94',
        },
        modal: {
          ondismiss: function () {
            setActiveProcessingPlan(null);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        setErrorMsg(`Payment failed: ${response.error.description || 'Transaction declined.'}`);
        setActiveProcessingPlan(null);
      });
      rzp.open();
    } catch (err: any) {
      console.error('Subscription error:', err);
      setErrorMsg(err.message || 'Subscription processing failed.');
      setActiveProcessingPlan(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-5xl bg-white dark:bg-[#0E0E12] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="relative p-5 sm:p-8 text-center border-b border-slate-200 dark:border-white/10 dark:bg-gradient-to-b dark:from-emerald-950/20 dark:to-transparent shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 sm:top-6 right-4 sm:right-6 p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-[#00FF94] text-xs font-mono font-bold uppercase tracking-widest mb-2 sm:mb-3">
            <Sparkles className="w-3.5 h-3.5" /> MarketWave Pricing Plans
          </div>
          <h2 className="text-xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
            Choose Your AI Intelligence Tier
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-white/60 mt-1.5 max-w-xl mx-auto font-mono">
            Unlock real-time news sentiment tracking, agent reasoning logs, and automated market watchdog alerts.
          </p>

          {/* Status Messages */}
          {errorMsg && (
            <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-mono max-w-lg mx-auto">
              ⚠️ {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-[#00FF94] text-xs font-mono font-bold max-w-lg mx-auto animate-bounce">
              {successMsg}
            </div>
          )}
        </div>

        {/* Plans Container */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#00FF94]" />
              <span className="text-xs font-mono text-slate-500 dark:text-white/40 uppercase tracking-widest">
                Fetching Razorpay Plans...
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isCurrent = currentPlanId === plan.id;
                const isProcessing = activeProcessingPlan === plan.id;

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col justify-between rounded-xl p-6 transition-all duration-300 ${
                      plan.popular
                        ? 'border-2 border-emerald-500 dark:border-[#00FF94] bg-slate-50 dark:bg-emerald-950/10 shadow-[0_0_30px_rgba(0,255,148,0.15)] scale-[1.02]'
                        : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131317] hover:border-slate-400 dark:hover:border-white/20'
                    }`}
                  >
                    {/* Popular Badge */}
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 dark:bg-[#00FF94] text-slate-900 font-black text-[10px] uppercase tracking-widest shadow-md">
                        MOST POPULAR
                      </div>
                    )}

                    <div>
                      {/* Plan Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500 dark:text-white/50">
                          {plan.badge}
                        </span>
                        {plan.id === 'free' && <Shield className="w-5 h-5 text-slate-400" />}
                        {plan.id === 'pro' && <Zap className="w-5 h-5 text-[#00FF94]" />}
                        {plan.id === 'enterprise' && <Crown className="w-5 h-5 text-amber-400" />}
                      </div>

                      <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white mt-2">
                        {plan.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-white/40 mt-1 min-h-[32px]">
                        {plan.tagline}
                      </p>

                      {/* Pricing */}
                      <div className="my-6 py-3 border-y border-slate-200 dark:border-white/10">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-slate-900 dark:text-white">
                            {plan.price_inr === 0 ? '₹0' : `₹${plan.price_inr.toLocaleString('en-IN')}/-`}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-white/40">
                            {plan.price_inr === 0 ? '/ month' : '/ mo'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-[#00FF94] block mt-0.5">
                          Prices in Indian Rupees (INR)
                        </span>
                      </div>

                      {/* Features */}
                      <ul className="space-y-3 mb-8">
                        {plan.features.map((feat, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-white/80">
                            <Check className="w-4 h-4 text-emerald-500 dark:text-[#00FF94] shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isCurrent || isProcessing}
                      className={`w-full py-3 px-4 rounded-lg font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all ${
                        isCurrent
                          ? 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/40 cursor-not-allowed border border-transparent'
                          : plan.popular
                          ? 'bg-emerald-500 dark:bg-[#00FF94] text-slate-900 hover:bg-emerald-400 dark:hover:bg-emerald-300 shadow-[0_0_15px_rgba(0,255,148,0.3)]'
                          : 'bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-slate-200'
                      }`}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrent ? (
                        'Active Plan'
                      ) : plan.id === 'free' ? (
                        'Select Starter'
                      ) : (
                        `Pay ₹${plan.price_inr}/- with Razorpay`
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="p-4 bg-slate-50 dark:bg-white/2 border-t border-slate-200 dark:border-white/10 text-center flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-white/40">
          <span>🔒 Secured with Razorpay 256-bit SSL Payment Gateway</span>
          <span>Includes GST invoice & instant plan activation</span>
        </div>
      </div>
    </div>
  );
};
