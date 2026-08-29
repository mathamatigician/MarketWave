import React, { useState, useEffect } from 'react';
import { 
  Send, 
  RefreshCw, 
  MessageSquare
} from 'lucide-react';
import { API_URL } from '../config';

interface FeedbackItem {
  id: string;
  rating: 'Need Improvement' | 'Good' | 'Excellent';
  comment: string;
  user_name: string;
  user_email: string;
  created_at: string;
}

interface UserProps {
  email?: string;
  first_name?: string;
  last_name?: string;
}

export function Feedback({ user }: { user: UserProps | null }) {
  const [rating, setRating] = useState<'Need Improvement' | 'Good' | 'Excellent'>('Excellent');
  const [comment, setComment] = useState('');
  const [name, setName] = useState(user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : '');
  const [email, setEmail] = useState(user?.email || '');
  
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/feedback`);
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setErrorMsg('Please enter a comment.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: comment.trim(),
          user_name: name.trim() || 'Anonymous Analyst',
          user_email: email.trim() || 'anonymous@marketwaveai.com'
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to submit feedback.');
      }

      setSuccessMsg('Feedback submitted successfully. Thank you!');
      setComment('');
      fetchFeedbacks();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl mx-auto">
      
      {/* Top Banner */}
      <div className="surface-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold dark:text-white text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-500 dark:text-[#00E599]" />
            Community Feedback & Reviews
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Help shape future releases of MarketWave algorithmic sentiment models.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Total Reviews:</span>
          <span className="font-bold text-slate-900 dark:text-white">{feedbacks.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Form Card */}
        <div className="surface-card p-6 space-y-4 lg:col-span-1">
          <h3 className="text-base font-bold dark:text-white text-slate-900">
            Submit Feedback
          </h3>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-xs">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-[#00E599] rounded-lg text-xs font-bold">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-700 dark:text-slate-300 font-semibold">Your Rating</label>
              <div className="grid grid-cols-3 gap-1.5 font-mono">
                {(['Need Improvement', 'Good', 'Excellent'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRating(r)}
                    className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      rating === r
                        ? 'bg-slate-900 text-white dark:bg-[#00E599] dark:text-black shadow-sm'
                        : 'surface-inset text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {r === 'Need Improvement' ? 'Needs Work' : r}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 dark:text-slate-300 font-semibold">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 dark:text-slate-300 font-semibold">Your Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@marketwave.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 dark:text-slate-300 font-semibold">Comments</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="What features or data sources would you like to see?"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary text-xs py-2.5 rounded-xl font-bold"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Submitting...' : 'Post Review'}</span>
            </button>
          </form>
        </div>

        {/* Reviews Feed */}
        <div className="surface-card p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold dark:text-white text-slate-900">
              Recent Feedback
            </h3>
            <button
              onClick={fetchFeedbacks}
              className="btn-ghost text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {feedbacks.length > 0 ? (
              feedbacks.map((item) => (
                <div key={item.id} className="surface-inset p-4 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white font-mono">{item.user_name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({item.user_email})</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      item.rating === 'Excellent' 
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#00E599]' 
                        : item.rating === 'Good' 
                          ? 'bg-cyan-500/15 text-cyan-600' 
                          : 'bg-amber-500/15 text-amber-600'
                    }`}>
                      {item.rating}
                    </span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                    {item.comment}
                  </p>
                  <span className="text-[10px] text-slate-400 font-mono block pt-1">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                No feedback received yet. Be the first to share your thoughts!
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
