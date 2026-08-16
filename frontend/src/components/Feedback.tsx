import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquarePlus, ThumbsUp, AlertCircle, CheckCircle2, Send, User, Mail, 
  Sparkles, RefreshCw, Star, Search, Filter, TrendingUp, ShieldCheck, Building2
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

  // Search & Filter State
  const [filterRating, setFilterRating] = useState<'ALL' | 'Need Improvement' | 'Good' | 'Excellent'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/feedback`);
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data);
      }
    } catch (err) {
      console.error('Failed to fetch feedbacks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  useEffect(() => {
    if (user) {
      if (!name && user.first_name) {
        setName(`${user.first_name} ${user.last_name || ''}`.trim());
      }
      if (!email && user.email) {
        setEmail(user.email);
      }
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setErrorMsg('Please enter a comment before submitting.');
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
          user_name: name.trim() || 'Anonymous User',
          user_email: email.trim() || 'anonymous@globepulseai.com'
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to submit feedback.');
      }

      setSuccessMsg('Thank you! Your feedback has been submitted successfully.');
      setComment('');
      fetchFeedbacks();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while submitting feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  // Analytics Computation
  const stats = useMemo(() => {
    const total = feedbacks.length;
    if (total === 0) return { total: 0, excellent: 0, good: 0, improvement: 0, score: 0, scorePercent: 0 };
    
    const excellent = feedbacks.filter(f => f.rating === 'Excellent').length;
    const good = feedbacks.filter(f => f.rating === 'Good').length;
    const improvement = feedbacks.filter(f => f.rating === 'Need Improvement').length;

    // Weight: Excellent=5, Good=4, Need Improvement=2
    const totalPoints = (excellent * 5) + (good * 4) + (improvement * 2);
    const score = (totalPoints / (total * 5)) * 5;
    const scorePercent = Math.round(((excellent + good) / total) * 100);

    return { total, excellent, good, improvement, score: score.toFixed(1), scorePercent };
  }, [feedbacks]);

  // Filtered Feedbacks
  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter(item => {
      const matchesRating = filterRating === 'ALL' || item.rating === filterRating;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q || 
        item.comment.toLowerCase().includes(q) || 
        item.user_name.toLowerCase().includes(q) || 
        item.user_email.toLowerCase().includes(q);
      return matchesRating && matchesQuery;
    });
  }, [feedbacks, filterRating, searchQuery]);

  const getRatingBadge = (ratingVal: string) => {
    switch (ratingVal) {
      case 'Need Improvement':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            Need Improvement
          </span>
        );
      case 'Good':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <ThumbsUp className="w-3.5 h-3.5" />
            Good
          </span>
        );
      case 'Excellent':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 dark:text-[#00FF94] border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            Excellent
          </span>
        );
    }
  };

  const renderStars = (ratingVal: string) => {
    const count = ratingVal === 'Excellent' ? 5 : ratingVal === 'Good' ? 4 : 3;
    return (
      <div className="flex items-center gap-0.5 text-amber-400">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star 
            key={i} 
            className={`w-3.5 h-3.5 ${i < count ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-white/20'}`} 
          />
        ))}
      </div>
    );
  };

  const getDomainFromEmail = (emailStr: string) => {
    if (!emailStr || !emailStr.includes('@')) return null;
    const domain = emailStr.split('@')[1];
    if (domain === 'globepulse.com' || domain === 'globepulseai.com' || domain === 'example.com') return null;
    return domain;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffHours < 48) return 'Yesterday';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full animate-in fade-in duration-500 py-6 space-y-8">
      
      {/* Page Header */}
      <div className="text-center sm:text-left flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b dark:border-white/10 border-slate-200 pb-6">
        <div>
          <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-2 font-mono">
            Community Intelligence & Reviews
          </label>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-slate-900 dark:text-white">
            User Feedback & <span className="text-[#00FF94] dark:text-[#00FF94] text-emerald-500">Insights</span>
          </h1>
          <p className="text-xs sm:text-sm dark:text-white/60 text-slate-600 mt-1 max-w-xl">
            Help us continuously refine GlobePulseAI. Share your terminal experience and browse feedback from institutional operators.
          </p>
        </div>

        <button
          onClick={fetchFeedbacks}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-bold dark:bg-white/5 bg-slate-100 dark:text-white/80 text-slate-700 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors border dark:border-white/10 border-slate-300"
          title="Refresh Feedbacks"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Analytics Summary Header Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 dark:bg-white/5 bg-white border dark:border-white/10 border-slate-200 p-5 rounded-xl shadow-lg">
        
        {/* Metric 1: Score */}
        <div className="flex items-center gap-4 sm:border-r dark:border-white/10 border-slate-200 pr-4">
          <div className="p-3.5 rounded-lg bg-emerald-500/10 text-emerald-500 dark:text-[#00FF94]">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-widest dark:text-white/40 text-slate-500">Satisfaction Score</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">{stats.scorePercent}%</span>
              <span className="text-xs font-bold text-emerald-500">Positive</span>
            </div>
            <div className="text-[11px] dark:text-white/50 text-slate-500 mt-0.5 flex items-center gap-1">
              <span>{stats.score} / 5.0 Rating</span>
              <div className="flex text-amber-400">★</div>
            </div>
          </div>
        </div>

        {/* Metric 2: Total Reviews */}
        <div className="flex items-center gap-4 sm:border-r dark:border-white/10 border-slate-200 px-0 sm:px-4">
          <div className="p-3.5 rounded-lg bg-blue-500/10 text-blue-500">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-widest dark:text-white/40 text-slate-500">Community Reviews</div>
            <div className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-0.5">{stats.total}</div>
            <div className="text-[11px] dark:text-white/50 text-slate-500 mt-0.5">Verified Operators</div>
          </div>
        </div>

        {/* Metric 3: Rating Breakdown Progress */}
        <div className="flex flex-col justify-center space-y-1.5 pl-0 sm:pl-4">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-emerald-500 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Excellent
            </span>
            <span className="dark:text-white/80 text-slate-700">{stats.excellent} ({stats.total ? Math.round((stats.excellent / stats.total) * 100) : 0}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${stats.total ? (stats.excellent / stats.total) * 100 : 0}%` }}></div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-amber-500 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Good
            </span>
            <span className="dark:text-white/80 text-slate-700">{stats.good} ({stats.total ? Math.round((stats.good / stats.total) * 100) : 0}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${stats.total ? (stats.good / stats.total) * 100 : 0}%` }}></div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-rose-500 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Need Improvement
            </span>
            <span className="dark:text-white/80 text-slate-700">{stats.improvement} ({stats.total ? Math.round((stats.improvement / stats.total) * 100) : 0}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${stats.total ? (stats.improvement / stats.total) * 100 : 0}%` }}></div>
          </div>
        </div>

      </div>

      {/* Main Content Grid: Form (2 cols) vs Feed (3 cols) */}
      <div className="grid lg:grid-cols-5 gap-8 items-start">
        
        {/* Left Form Column */}
        <div className="lg:col-span-2 dark:bg-white/5 bg-white border dark:border-white/10 border-slate-200 p-6 rounded-xl shadow-xl sticky top-4">
          
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b dark:border-white/10 border-slate-200">
            <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-500 dark:text-[#00FF94]">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-tight text-slate-900 dark:text-white">Submit Your Review</h2>
              <p className="text-[11px] dark:text-white/50 text-slate-500">Share your terminal feedback with the product team</p>
            </div>
          </div>

          {successMsg && (
            <div className="mb-4 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Rating Selector */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-bold uppercase tracking-widest dark:text-white/60 text-slate-500">
                  Select Rating
                </label>
                {renderStars(rating)}
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {(['Need Improvement', 'Good', 'Excellent'] as const).map((r) => {
                  const isSelected = rating === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRating(r)}
                      className={`p-2.5 rounded-lg text-center transition-all duration-200 text-xs font-bold flex flex-col items-center justify-center gap-1.5 border ${
                        isSelected
                          ? r === 'Need Improvement'
                            ? 'bg-rose-500 text-white border-rose-600 shadow-md scale-105'
                            : r === 'Good'
                            ? 'bg-amber-500 text-black border-amber-600 shadow-md scale-105'
                            : 'bg-emerald-500 dark:bg-[#00FF94] text-black border-emerald-400 shadow-md scale-105'
                          : 'dark:bg-white/5 bg-slate-50 text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    >
                      {r === 'Need Improvement' && <AlertCircle className="w-4 h-4" />}
                      {r === 'Good' && <ThumbsUp className="w-4 h-4" />}
                      {r === 'Excellent' && <Sparkles className="w-4 h-4" />}
                      <span className="text-[10px] leading-tight">{r}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Comment Area */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest dark:text-white/60 text-slate-500">
                  Feedback Comment
                </label>
                <span className="text-[10px] font-mono dark:text-white/30 text-slate-400">
                  {comment.length} / 500
                </span>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                placeholder="Share your thoughts on sentiment accuracy, UI speed, chart overlays, or feature requests..."
                rows={4}
                required
                className="w-full dark:bg-black/50 bg-slate-50 border dark:border-white/10 border-slate-300 p-3 text-xs font-mono dark:text-white text-slate-900 placeholder:text-slate-400 dark:placeholder:text-white/30 rounded-lg focus:outline-none focus:border-emerald-500 dark:focus:border-[#00FF94] transition-colors resize-none"
              />
            </div>

            {/* User Metadata Fields */}
            <div className="space-y-3 pt-2 border-t dark:border-white/10 border-slate-200">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest dark:text-white/60 text-slate-500 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-white/40" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Smith"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono dark:bg-black/50 bg-slate-50 border dark:border-white/10 border-slate-300 dark:text-white text-slate-900 rounded-lg focus:outline-none focus:border-emerald-500 dark:focus:border-[#00FF94]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest dark:text-white/60 text-slate-500 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-white/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. operator@vanguardcapital.io"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono dark:bg-black/50 bg-slate-50 border dark:border-white/10 border-slate-300 dark:text-white text-slate-900 rounded-lg focus:outline-none focus:border-emerald-500 dark:focus:border-[#00FF94]"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 dark:bg-[#00FF94] bg-emerald-500 dark:text-black text-white py-3 px-4 rounded-lg text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-[0.99]"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Review...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Feedback</span>
                </>
              )}
            </button>

          </form>
        </div>

        {/* Right Reviews List Column */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Controls: Filter Chips & Search Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-100 dark:bg-white/5 p-3 rounded-xl border dark:border-white/10 border-slate-200">
            
            {/* Rating Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-white/40 ml-1 mr-1 hidden sm:block" />
              {(['ALL', 'Excellent', 'Good', 'Need Improvement'] as const).map(opt => {
                const isActive = filterRating === opt;
                const count = opt === 'ALL' ? stats.total : opt === 'Excellent' ? stats.excellent : opt === 'Good' ? stats.good : stats.improvement;
                return (
                  <button
                    key={opt}
                    onClick={() => setFilterRating(opt)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                      isActive 
                        ? 'dark:bg-white bg-slate-900 dark:text-black text-white shadow'
                        : 'dark:text-white/60 text-slate-600 hover:bg-slate-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {opt === 'ALL' ? 'All' : opt} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 dark:text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reviews..."
                className="w-full pl-8 pr-3 py-1.5 text-xs font-mono dark:bg-black/50 bg-white border dark:border-white/10 border-slate-300 dark:text-white text-slate-900 rounded-md focus:outline-none focus:border-emerald-500 dark:focus:border-[#00FF94]"
              />
            </div>

          </div>

          {/* Feedbacks Stream List */}
          {loading && feedbacks.length === 0 ? (
            <div className="p-12 text-center font-mono text-xs dark:text-white/40 text-slate-500 animate-pulse border dark:border-white/10 border-slate-200 rounded-xl">
              Loading community feedback stream...
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="p-12 text-center border dark:border-white/10 border-slate-200 rounded-xl bg-white dark:bg-white/5">
              <div className="text-2xl mb-2">🔍</div>
              <div className="text-xs font-bold text-slate-700 dark:text-white/80">No matching feedback entries</div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-white/40 mt-1">
                Try clearing your search query or switching rating filters.
              </div>
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[640px] overflow-y-auto pr-1">
              {filteredFeedbacks.map((item) => {
                const domain = getDomainFromEmail(item.user_email);
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all duration-200 dark:bg-white/5 bg-white shadow-sm hover:shadow-md ${
                      item.rating === 'Excellent' 
                        ? 'border-slate-200 dark:border-white/10 hover:border-emerald-500/40' 
                        : item.rating === 'Good' 
                        ? 'border-slate-200 dark:border-white/10 hover:border-amber-500/40' 
                        : 'border-slate-200 dark:border-white/10 hover:border-rose-500/40'
                    }`}
                  >
                    {/* Card Top Header */}
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs font-mono uppercase ${
                          item.rating === 'Excellent'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-[#00FF94]'
                            : item.rating === 'Good'
                            ? 'bg-amber-500/20 text-amber-500'
                            : 'bg-rose-500/20 text-rose-500'
                        }`}>
                          {item.user_name ? item.user_name.charAt(0) : 'A'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold dark:text-white text-slate-900 leading-tight">
                              {item.user_name || 'Anonymous User'}
                            </span>
                            {domain && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/60">
                                <Building2 className="w-2.5 h-2.5" />
                                {domain}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono dark:text-white/40 text-slate-500 mt-0.5">
                            {item.user_email}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          {renderStars(item.rating)}
                          {getRatingBadge(item.rating)}
                        </div>
                        <span className="text-[10px] font-mono dark:text-white/30 text-slate-400">
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Comment Content */}
                    <p className="text-xs font-mono dark:text-white/90 text-slate-700 leading-relaxed mt-3 pl-3 border-l-2 dark:border-emerald-500/50 border-emerald-500 bg-slate-50/50 dark:bg-white/2 py-2 rounded-r-md">
                      "{item.comment}"
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
