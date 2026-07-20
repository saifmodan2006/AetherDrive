'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  File as FileIcon, 
  Folder as FolderIcon, 
  Download, 
  Lock, 
  Loader2, 
  HardDrive, 
  ChevronRight,
  Globe,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import api from '@/utils/api';

interface ShareMeta {
  id: string;
  shareToken: string;
  type: 'file' | 'folder';
  name: string;
  size: number | null;
  mimeType: string | null;
  owner: string;
  isPasswordProtected: boolean;
  accessRole: string;
}

interface SharedFolderItem {
  id: string;
  name: string;
  createdAt: string;
}

interface SharedFileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  version: number;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export default function ShareViewPage() {
  const params = useParams();
  const token = params.token as string;

  // State Management
  const [metadata, setMetadata] = useState<ShareMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Password Verification State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [shareSessionToken, setShareSessionToken] = useState<string | null>(null);

  // Shared Contents State (for folders)
  const [folders, setFolders] = useState<SharedFolderItem[]>([]);
  const [files, setFiles] = useState<SharedFileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [contentsLoading, setContentsLoading] = useState(false);

  // File download state
  const [downloading, setDownloading] = useState(false);

  // 1. Load initial metadata
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await api.get(`/shares/${token}`);
        setMetadata(response.data);
        // If not password-protected, they are immediately authorized to view
        if (!response.data.isPasswordProtected) {
          setIsAuthenticated(true);
        }
      } catch (err: any) {
        console.error(err);
        setMetaError(err.response?.data?.error || 'Failed to resolve shared link');
      } finally {
        setMetaLoading(false);
      }
    };
    loadMetadata();
  }, [token]);

  // 2. Fetch folder contents (only if authenticated and resource is a folder)
  const fetchSharedContents = async () => {
    if (!metadata || metadata.type !== 'folder' || !isAuthenticated) return;
    setContentsLoading(true);

    try {
      const folderParam = currentFolderId ? `?folderId=${currentFolderId}` : '';
      const headers = shareSessionToken ? { Authorization: `Bearer ${shareSessionToken}` } : {};

      const response = await api.get(`/shares/${token}/contents${folderParam}`, { headers });
      setFolders(response.data.folders || []);
      setFiles(response.data.files || []);
      setBreadcrumbs(response.data.breadcrumbs || []);
    } catch (err) {
      console.error('Failed to load shared folder contents:', err);
    } finally {
      setContentsLoading(false);
    }
  };

  useEffect(() => {
    fetchSharedContents();
  }, [metadata, isAuthenticated, currentFolderId, shareSessionToken]);

  // Handle password submit
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setPasswordLoading(true);
    setPasswordError(null);

    try {
      const response = await api.post(`/shares/${token}/verify`, { password });
      setShareSessionToken(response.data.accessToken);
      setIsAuthenticated(true);
    } catch (err: any) {
      console.error(err);
      setPasswordError(err.response?.data?.error || 'Incorrect password');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle shared file download
  const handleDownloadFile = async () => {
    if (!metadata || metadata.type !== 'file') return;
    setDownloading(true);

    try {
      // Pass temporary token if password protected
      const tokenParam = shareSessionToken ? `?token=${shareSessionToken}` : '';
      const response = await api.get(`/shares/${token}/download${tokenParam}`, {
        responseType: 'blob',
      });

      const contentType = response.headers['content-type'];
      const blob = new Blob([response.data], { 
        type: typeof contentType === 'string' ? contentType : undefined 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', metadata.name || 'download');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download file');
    } finally {
      setDownloading(false);
    }
  };

  // Handle download of a file inside a shared folder
  const handleDownloadFolderFile = async (fileId: string, fileName: string) => {
    try {
      const tokenParam = shareSessionToken ? `?token=${shareSessionToken}` : '';
      // We stream the file directly via the download share link
      const response = await api.get(`/shares/${token}/download${tokenParam}`, {
        responseType: 'blob',
        // In backend downloadShareFile, we stream the shared file. Wait! 
        // If they download a file inside a shared folder, how does the downloadShareFile endpoint know which fileId?
        // Ah! In shareController.ts `downloadShareFile`, it downloads `share.file` because it's mapping `share.fileId`.
        // But what if it's a folder share, and they click a file inside the folder?
        // Let's check our downloadShareFile endpoint in shareController!
        // Oh! In shareController.ts `downloadShareFile` (lines 351+):
        // It retrieves `share = await prisma.fileShare.findUnique({ where: { shareToken: token }, include: { file: ... } })`
        // And checks `if (!share || !share.fileId || !share.file)`.
        // This means it ONLY supports downloading the primary file of a file-share, not files inside a folder-share!
        // Let's look: how should we download files inside a shared folder?
        // We can pass a `fileId` query parameter: `/shares/:token/download?fileId=...`.
        // Yes! Let's check: did we write support for `fileId` inside `downloadShareFile`?
        // No, we only checked `share.fileId`.
        // Let's modify `downloadShareFile` to support downloading specific files inside a shared folder as well!
        // This is a crucial edge-case detail that we must update in the backend `shareController.ts`.
        // Let's do that! But first, let's complete the frontend code here so it maps correctly:
        // `api.get(`/shares/${token}/download?fileId=${fileId}&token=...`)`
      });
      // We will write the download code below.
    } catch (err) {}
  };

  const handleDownloadFileInFolder = async (fileId: string, fileName: string) => {
    try {
      const tokenParam = shareSessionToken ? `&token=${shareSessionToken}` : '';
      const response = await api.get(
        `/shares/${token}/download?fileId=${fileId}${tokenParam}`, 
        { responseType: 'blob' }
      );
      const contentType = response.headers['content-type'];
      const blob = new Blob([response.data], { 
        type: typeof contentType === 'string' ? contentType : undefined 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download file');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // RENDER: Loading
  if (metaLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-50 text-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="mt-4 text-xs font-semibold text-slate-500">Resolving shared link...</p>
      </div>
    );
  }

  // RENDER: Error
  if (metaError || !metadata) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-650 border border-red-100">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-lg font-bold text-slate-900">Link Unavailable</h2>
        <p className="mt-1.5 text-xs text-slate-500 max-w-sm leading-relaxed">
          {metaError || 'This share link is invalid, expired, or has been disabled by the owner.'}
        </p>
      </div>
    );
  }

  // RENDER: Password Prompt (if not verified yet)
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white font-display font-extrabold shadow-sm">
              A
            </div>
            <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-slate-900">
              Password Required
            </h2>
            <p className="mt-1.5 text-xs text-slate-500">
              "{metadata.name}" is password-protected by {metadata.owner}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordError && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-600">
                  {passwordError}
                </div>
              )}

              <div>
                <label htmlFor="share-password" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Enter Password
                </label>
                <input
                  id="share-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-650 focus:outline-none focus:ring-1 focus:ring-indigo-650"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={passwordLoading}
                className="group relative flex w-full justify-center items-center gap-1.5 rounded-lg bg-indigo-650 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
              >
                {passwordLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Access Link
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Shared FILE Page
  if (metadata.type === 'file') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white font-display font-extrabold shadow-sm">
              A
            </div>
            <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-slate-900">
              Shared File
            </h2>
            <p className="text-xs text-slate-400">Shared by {metadata.owner}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 shrink-0">
                <FileIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">
                  {metadata.name}
                </h3>
                <p className="text-[10px] text-slate-450 mt-1 uppercase tracking-wide font-semibold">
                  {metadata.mimeType?.split('/')[1] || 'Unknown'} File &bull; {metadata.size ? formatBytes(metadata.size) : '0 Bytes'}
                </p>
              </div>
            </div>

            <button
              onClick={handleDownloadFile}
              disabled={downloading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? 'Downloading...' : 'Download File'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Shared FOLDER Page (Explorer)
  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50/50 text-slate-800 font-sans overflow-hidden">
      
      {/* Public Header */}
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-650 text-white shadow-sm font-display font-extrabold text-base">
            A
          </div>
          <div>
            <span className="font-display font-bold text-slate-900 tracking-tight text-sm">AetherDrive</span>
            <span className="ml-2 text-[10px] text-slate-400 font-semibold px-2 py-0.5 rounded-full bg-slate-100">
              Shared Folder
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 font-semibold">
          Shared by <span className="text-slate-800 font-bold">{metadata.owner}</span>
        </p>
      </header>

      {/* Main Shared Explorer Contents */}
      <main className="flex-1 flex flex-col min-w-0 p-8 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
        
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold text-slate-500 bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.01)] shrink-0">
          <button 
            onClick={() => setCurrentFolderId(null)}
            className="hover:text-indigo-650 transition-colors cursor-pointer shrink-0"
          >
            {metadata.name}
          </button>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              <button
                onClick={() => setCurrentFolderId(crumb.id)}
                className="hover:text-indigo-650 transition-colors cursor-pointer shrink-0 truncate max-w-[120px]"
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Contents lists */}
        {contentsLoading ? (
          <div className="flex-1 flex flex-col justify-center items-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="mt-2.5 text-xs text-slate-400 font-medium">Fetching folder contents...</p>
          </div>
        ) : (
          <div className="space-y-8 flex-1 flex flex-col justify-start">
            
            {/* Subfolders Grid */}
            {folders.length > 0 && (
              <div className="space-y-3 shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Folders ({folders.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      onDoubleClick={() => setCurrentFolderId(folder.id)}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md transition-all select-none cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderIcon className="h-5 w-5 text-indigo-500 shrink-0" />
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {folder.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files Tabular List */}
            <div className="space-y-3 flex-1 flex flex-col justify-start min-h-[250px]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Files ({files.length})
              </h3>
              {files.length > 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col justify-start">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-3.5 px-5">Name</th>
                          <th className="py-3.5 px-4">Size</th>
                          <th className="py-3.5 px-4">Uploaded</th>
                          <th className="py-3.5 px-4 text-right pr-6">Download</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {files.map((file) => (
                          <tr key={file.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-5 flex items-center gap-2.5 min-w-0">
                              <FileIcon className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                              <span className="text-slate-800 font-semibold truncate leading-tight">
                                {file.name}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-500 shrink-0">
                              {formatBytes(file.size)}
                            </td>
                            <td className="py-3 px-4 text-slate-500 shrink-0">
                              {new Date(file.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right pr-6 shrink-0">
                              <button
                                onClick={() => handleDownloadFileInFolder(file.id, file.name)}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-indigo-650 hover:bg-slate-100 transition-all cursor-pointer"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                folders.length === 0 && (
                  <div className="flex-1 flex flex-col justify-center items-center border-2 border-dashed border-slate-200 rounded-xl p-12 bg-white/40">
                    <HardDrive className="h-10 w-10 text-slate-350" />
                    <p className="mt-3 text-xs font-semibold text-slate-505">Shared directory is empty</p>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
