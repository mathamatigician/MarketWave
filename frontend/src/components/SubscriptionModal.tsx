import React, { useState, useEffect } from 'react';
import { Check, Crown, X, Loader2 } from 'lucide-react';
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
  const [activeProcessingPlan, setActiveProcessingPlan] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const currentPlanId = currentSubscription?.plan_id || 'free';

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      fetch(`${API_URL}/api/subscription/plans`)
        .then((res) => res.json())
        .then((data) => {
          setPlans(data);
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg('Failed to load subscription plans.');
        });
    }
  }, [isOpen]);

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
      if (plan.id === 'free') {
        const res = await fetch(`${API_URL}/api/subscription/verify-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, plan_id: 'free' }),
        });
        const data = await res.json();
        if (res.ok && data.subscription) {
          setSuccessMsg('Switched to Starter Plan.');
          onSubscriptionSuccess(data.subscription);
        }
        return;
      }

      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        setErrorMsg('Razorpay payment gateway failed to load.');
        return;
      }

      const orderRes = await fetch(`${API_URL}/api/subscription/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, plan_id: plan.id }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        setErrorMsg(orderData.detail || 'Order creation failed.');
        return;
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'MarketWave Financial Intelligence',
        description: `${plan.name} Tier Upgrade`,
        order_id: orderData.order_id,
        prefill: { email: userEmail },
        theme: { color: '#00E599' },
        handler: async (response: any) => {
          try {
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
              setSuccessMsg(`Upgraded to ${plan.name}!`);
              onSubscriptionSuccess(verifyData.subscription);
            } else {
              setErrorMsg(verifyData.detail || 'Payment verification failed.');
            }
          } catch (e) {
            setErrorMsg('Network error verifying payment.');
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setActiveProcessingPlan(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="surface-card w-full max-w-4xl p-6 sm:p-8 space-y-6 shadow-2xl relative my-8">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full surface-inset text-amber-500 text-xs font-mono font-bold">
            <Crown className="w-3.5 h-3.5" />
            <span>MARKETWAVE MEMBERSHIP</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold dark:text-white text-slate-900 tracking-tight">
            Institutional Market Intelligence Plans
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Select the tier suited for your research workflow.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xs text-center font-mono">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-[#00E599] rounded-xl text-xs text-center font-mono font-bold">
            {successMsg}
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {plans.map((plan) => {
            const isCurrent = currentPlanId === plan.id;
            const isProcessing = activeProcessingPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`surface-card p-6 flex flex-col justify-between space-y-6 relative transition-all ${
                  plan.popular 
                    ? 'border-emerald-500 dark:border-[#00E599] shadow-lg shadow-emerald-500/10' 
                    : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-black font-mono font-extrabold text-[10px] uppercase">
                    Most Popular
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">{plan.badge}</span>
                    <h3 className="text-lg font-bold dark:text-white text-slate-900">{plan.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{plan.tagline}</p>
                  </div>

                  <div className="pt-2">
                    <span className="text-3xl font-black font-mono dark:text-white text-slate-900">
                      ₹{plan.price_inr.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-slate-400 font-mono"> / {plan.billing}</span>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-white/10">
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00E599] shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isCurrent || isProcessing}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    isCurrent
                      ? 'surface-inset text-slate-400 cursor-default'
                      : plan.popular
                        ? 'btn-primary'
                        : 'btn-secondary'
                  }`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCurrent ? (
                    <span>Active Plan</span>
                  ) : (
                    <span>Upgrade to {plan.name}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
