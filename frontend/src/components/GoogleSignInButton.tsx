import { useEffect, useRef } from 'react';
import { API_URL, GOOGLE_CLIENT_ID } from '../config';

interface UserInfo {
  email: string;
  first_name: string;
  last_name: string;
  watchlist: string[];
  picture?: string;
}

declare global {
  interface Window {
    google?: any;
  }
}

interface GoogleSignInButtonProps {
  onLoginSuccess: (user: UserInfo) => void;
}

export function GoogleSignInButton({ onLoginSuccess }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        try {
          const res = await fetch(`${API_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });
          if (res.ok) {
            onLoginSuccess(await res.json());
          }
        } catch (e) {
          // Network error — the existing email/password form remains usable.
        }
      },
    });

    if (buttonRef.current) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
      });
    }
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <div ref={buttonRef} />
      <div className="flex items-center gap-3 my-4 w-full">
        <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700" />
        <span className="text-[11px] uppercase tracking-widest text-slate-400">or continue with email</span>
        <div className="flex-1 h-px bg-slate-300 dark:bg-slate-700" />
      </div>
    </>
  );
}
