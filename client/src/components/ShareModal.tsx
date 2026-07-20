'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Lock, Calendar, Globe, Loader2, Link2 } from 'lucide-react';
import api from '@/utils/api';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string | null;
  folderId: string | null;
  resourceName: string;
}

export default function ShareModal({ isOpen, onClose, fileId, folderId, resourceName }: ShareModalProps) {
  const [accessRole, setAccessRole] = useState('VIEWER');
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post('/shares', {
        fileId,
        folderId,
        accessRole,
        isPublic,
        password: password || undefined,
        expiresAt: expiresAt || undefined,
      });

      const { shareToken } = response.data;
      const origin = window.location.origin;
      setShareLink(`${origin}/share/${shareToken}`);
    } catch (err) {
      console.error('Failed to create share link:', err);
      alert('Error generating share link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setShareLink(null);
    setPassword('');
    setExpiresAt('');
    setAccessRole('VIEWER');
    setIsPublic(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4.5 w-4.5 text-indigo-600" />
            <h3 className="font-display text-sm font-bold text-slate-900">Share "{resourceName}"</h3>
          </div>
          <button 
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {shareLink ? (
          /* Share Link Generated State */
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-indigo-50/50 border border-indigo-100 p-4 text-center space-y-3">
              <Globe className="h-8 w-8 text-indigo-650 mx-auto" />
              <h4 className="text-xs font-bold text-slate-800">Share Link Generated Successfully</h4>
              <p className="text-[10px] text-slate-500 leading-normal">
                Anyone with this link can {accessRole === 'VIEWER' ? 'view' : 'edit'} this resource.
                {password && ' This link is password-protected.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Share Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer min-w-[110px]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleReset}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Create Another Link
              </button>
            </div>
          </div>
        ) : (
          /* Configuration State Form */
          <form onSubmit={handleGenerateLink} className="mt-4 space-y-4">
            
            {/* Access Role Permission */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Permission Role
              </label>
              <select
                value={accessRole}
                onChange={(e) => setAccessRole(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
              >
                <option value="VIEWER">Viewer (Read-only)</option>
                <option value="EDITOR">Editor (Can upload/edit)</option>
              </select>
            </div>

            {/* Optional Password Protection */}
            <div>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Password Protection (Optional)
                </label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password..."
                className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            {/* Optional Expiry Date */}
            <div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Expiration Date (Optional)
                </label>
              </div>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 cursor-pointer disabled:opacity-50"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Generate Share Link
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
