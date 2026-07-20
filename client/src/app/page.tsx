'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/utils/api';
import { 
  HardDrive, 
  LogOut, 
  Settings, 
  Users, 
  User as UserIcon,
  Search,
  Bell,
  Activity,
  Plus,
  Folder as FolderIcon,
  File as FileIcon,
  Trash2,
  Download,
  ChevronRight,
  Loader2,
  FolderPlus,
  Upload,
  X,
  Share2,
  Copy,
  Link as LinkIcon,
  Calendar,
  Shield
} from 'lucide-react';
import ShareModal from '@/components/ShareModal';

interface FolderData {
  id: string;
  name: string;
  createdAt: string;
}

interface FileData {
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

export default function Dashboard() {
  const { user, clearAuth } = useAuthStore();
  const router = useRouter();

  // State Management
  const [viewMode, setViewMode] = useState<'drive' | 'shared' | 'activity'>('drive');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [files, setFiles] = useState<FileData[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Activity Log State
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Shares State
  const [sharedLinks, setSharedLinks] = useState<any[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // Modals / Inputs
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderActionLoading, setFolderActionLoading] = useState(false);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Sharing State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [shareFolderId, setShareFolderId] = useState<string | null>(null);
  const [shareResourceName, setShareResourceName] = useState('');

  const handleOpenShare = (resourceId: string, resourceName: string, isFolder: boolean) => {
    if (isFolder) {
      setShareFolderId(resourceId);
      setShareFileId(null);
    } else {
      setShareFileId(resourceId);
      setShareFolderId(null);
    }
    setShareResourceName(resourceName);
    setShareModalOpen(true);
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      clearAuth();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      clearAuth();
      router.push('/login');
    }
  };

  const activeWorkspace = user?.workspaces?.[0];

  // Fetch directory contents
  const fetchContents = async () => {
    if (!activeWorkspace) return;
    setLoadingContents(true);
    try {
      const folderParam = currentFolderId ? `&folderId=${currentFolderId}` : '';
      const response = await api.get(
        `/folders/contents?workspaceId=${activeWorkspace.id}${folderParam}`
      );
      setFolders(response.data.folders || []);
      setFiles(response.data.files || []);
      setBreadcrumbs(response.data.breadcrumbs || []);
    } catch (err) {
      console.error('Failed to load workspace contents:', err);
    } finally {
      setLoadingContents(false);
    }
  };

  const fetchActivityLogs = async () => {
    if (!activeWorkspace) return;
    setLoadingActivity(true);
    try {
      const response = await api.get(`/folders/activity?workspaceId=${activeWorkspace.id}`);
      setActivityLogs(response.data.logs || []);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoadingActivity(false);
    }
  };

  const fetchSharedLinks = async () => {
    if (!activeWorkspace) return;
    setLoadingShares(true);
    try {
      const response = await api.get(`/shares/workspace?workspaceId=${activeWorkspace.id}`);
      setSharedLinks(response.data.shares || []);
    } catch (err) {
      console.error('Failed to load shared links:', err);
    } finally {
      setLoadingShares(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm('Are you sure you want to revoke this share link? It will no longer be accessible.')) return;
    try {
      await api.delete(`/shares/${shareId}`);
      fetchSharedLinks();
    } catch (err) {
      console.error('Failed to revoke share link:', err);
      alert('Failed to revoke share link');
    }
  };

  useEffect(() => {
    if (viewMode === 'drive') {
      fetchContents();
    } else if (viewMode === 'activity') {
      fetchActivityLogs();
    } else if (viewMode === 'shared') {
      fetchSharedLinks();
    }
  }, [currentFolderId, activeWorkspace, viewMode]);

  if (!user) return null;

  // Create Folder handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !activeWorkspace) return;

    setFolderActionLoading(true);
    try {
      await api.post('/folders', {
        name: newFolderName,
        workspaceId: activeWorkspace.id,
        parentId: currentFolderId,
      });
      setNewFolderName('');
      setShowFolderModal(false);
      fetchContents();
    } catch (err) {
      console.error('Create folder error:', err);
      alert('Failed to create folder');
    } finally {
      setFolderActionLoading(false);
    }
  };

  // Delete Folder handler
  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!activeWorkspace) return;
    if (!confirm(`Are you sure you want to delete folder "${folderName}" and all of its contents?`)) {
      return;
    }

    try {
      await api.delete(`/folders/${folderId}?workspaceId=${activeWorkspace.id}`);
      fetchContents();
    } catch (err) {
      console.error('Delete folder error:', err);
      alert('Failed to delete folder');
    }
  };

  // Upload File handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || !activeWorkspace) return;

    const file = selectedFiles[0];
    setUploadLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('workspaceId', activeWorkspace.id);
    if (currentFolderId) {
      formData.append('folderId', currentFolderId);
    }

    try {
      await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      fetchContents();
    } catch (err) {
      console.error('File upload error:', err);
      alert('Failed to upload file');
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Download File handler
  const handleDownloadFile = async (fileId: string, fileName: string) => {
    if (!activeWorkspace) return;
    try {
      const response = await api.get(`/files/${fileId}/download?workspaceId=${activeWorkspace.id}`, {
        responseType: 'blob',
      });
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
      console.error('Download error:', err);
      alert('Failed to download file');
    }
  };

  // Delete File handler
  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!activeWorkspace) return;
    if (!confirm(`Are you sure you want to delete file "${fileName}"?`)) {
      return;
    }

    try {
      await api.delete(`/files/${fileId}?workspaceId=${activeWorkspace.id}`);
      fetchContents();
    } catch (err) {
      console.error('Delete file error:', err);
      alert('Failed to delete file');
    }
  };

  // Format File Size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Search filter
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50/50 text-slate-800 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between shrink-0">
        <div>
          {/* Logo & Platform Name */}
          <div className="h-28 flex items-center justify-center border-b border-slate-100 py-3 px-4">
            <img src="/logo.png" alt="AetherDrive" className="h-24 w-auto mix-blend-multiply" />
          </div>

          {/* Navigation Items */}
          <div className="p-4 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Workspaces
            </div>

            {/* Workspace Display */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                <span className="truncate">{activeWorkspace?.name || 'Personal Drive'}</span>
                <span className="text-[10px] text-indigo-600 font-extrabold px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100/50 uppercase tracking-wide">
                  {activeWorkspace?.role || 'OWNER'}
                </span>
              </div>
            </div>

            <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              File Cabinet
            </div>
            
            <button 
              onClick={() => { setViewMode('drive'); setCurrentFolderId(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border text-left cursor-pointer ${
                viewMode === 'drive' 
                ? 'bg-indigo-50 text-indigo-600 border-indigo-100/50' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent'
              }`}
            >
              <HardDrive className="h-4.5 w-4.5" />
              My Drive
            </button>
            
            <button 
              onClick={() => setViewMode('shared')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border text-left cursor-pointer ${
                viewMode === 'shared' 
                ? 'bg-indigo-50 text-indigo-600 border-indigo-100/50' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent'
              }`}
            >
              <Users className="h-4.5 w-4.5" />
              Shared Links
            </button>
            
            <button 
              onClick={() => setViewMode('activity')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border text-left cursor-pointer ${
                viewMode === 'activity' 
                ? 'bg-indigo-50 text-indigo-600 border-indigo-100/50' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-transparent'
              }`}
            >
              <Activity className="h-4.5 w-4.5" />
              Activity Log
            </button>
          </div>
        </div>

        {/* Sidebar Footer User Details */}
        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="truncate flex-1">
              <p className="text-xs font-bold text-slate-800 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-red-650 hover:bg-red-50 text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4 text-red-500" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Workspace Pane */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative bg-slate-50/40">
        {/* Header toolbar */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0">
          {/* Search bar input */}
          <div className="w-80 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-slate-700 placeholder-slate-400 transition-colors focus:border-indigo-600 focus:bg-white focus:outline-none text-xs"
            />
          </div>

          {/* Quick actions panel */}
          <div className="flex items-center gap-3">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shadow-sm">
              <Bell className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shadow-sm">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Workspace Operations & File Browser */}
        <div className="p-8 max-w-7xl w-full mx-auto space-y-6 flex-1 flex flex-col">
          
          {viewMode === 'drive' && (
            <>
              {/* Action Bar (Breadcrumbs & Buttons) */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                
                {/* Breadcrumb Trail */}
                <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold text-slate-500 py-1">
                  <button 
                    onClick={() => setCurrentFolderId(null)}
                    className="hover:text-indigo-600 transition-colors cursor-pointer shrink-0"
                  >
                    My Drive
                  </button>
                  {breadcrumbs.map((crumb) => (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                      <button
                        onClick={() => setCurrentFolderId(crumb.id)}
                        className="hover:text-indigo-600 transition-colors cursor-pointer shrink-0 truncate max-w-[120px]"
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {/* Folder / File Manipulation Buttons */}
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setShowFolderModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer"
                  >
                    <FolderPlus className="h-4 w-4 text-slate-500" />
                    New Folder
                  </button>
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploadLoading ? 'Uploading...' : 'Upload File'}
                  </button>
                </div>
              </div>

              {/* Core Folder/File Grid lists */}
              {loadingContents ? (
                <div className="flex-1 flex flex-col justify-center items-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <p className="mt-2.5 text-xs text-slate-400 font-medium">Fetching folder contents...</p>
                </div>
              ) : (
                <div className="space-y-8 flex-1 flex flex-col justify-start">
                  
                  {/* Folders Section */}
                  {filteredFolders.length > 0 && (
                    <div className="space-y-3 shrink-0">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Folders ({filteredFolders.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredFolders.map((folder) => (
                          <div
                            key={folder.id}
                            onDoubleClick={() => setCurrentFolderId(folder.id)}
                            className="group flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md transition-all select-none cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FolderIcon className="h-5 w-5 text-indigo-500 shrink-0" />
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {folder.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenShare(folder.id, folder.name, true);
                                }}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFolder(folder.id, folder.name);
                                }}
                                className="h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-650 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Files Section */}
                  <div className="space-y-3 flex-1 flex flex-col justify-start min-h-[250px]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Files ({filteredFiles.length})
                    </h3>
                    {filteredFiles.length > 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col justify-start">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                <th className="py-3.5 px-5">Name</th>
                                <th className="py-3.5 px-4">Size</th>
                                <th className="py-3.5 px-4">Uploaded</th>
                                <th className="py-3.5 px-4 text-right pr-6">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                              {filteredFiles.map((file) => (
                                <tr key={file.id} className="hover:bg-slate-50/50 group transition-colors">
                                  <td className="py-3 px-5 flex items-center gap-2.5 min-w-0">
                                    <FileIcon className="h-4.5 w-4.5 text-slate-450 shrink-0" />
                                    <div className="truncate">
                                      <p className="text-slate-800 font-semibold truncate leading-tight">
                                        {file.name}
                                      </p>
                                      <p className="text-[10px] text-slate-400">
                                        v{file.version}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-slate-500 shrink-0">
                                    {formatBytes(file.size)}
                                  </td>
                                  <td className="py-3 px-4 text-slate-500 shrink-0">
                                    {new Date(file.createdAt).toLocaleDateString()}
                                  </td>
                                  <td className="py-3 px-4 text-right pr-6 shrink-0">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => handleOpenShare(file.id, file.name, false)}
                                        className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer"
                                        title="Share Link"
                                      >
                                        <Share2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDownloadFile(file.id, file.name)}
                                        className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer"
                                        title="Download"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteFile(file.id, file.name)}
                                        className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-650 hover:bg-red-50 transition-all cursor-pointer"
                                        title="Delete"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
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
                          <HardDrive className="h-10 w-10 text-slate-300" />
                          <p className="mt-3 text-xs font-semibold text-slate-500">This directory is empty</p>
                          <p className="mt-1 text-[10px] text-slate-450">Use the buttons above to add folders or upload files</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {viewMode === 'shared' && (
            <div className="space-y-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Active Share Links</h2>
                  <p className="text-xs text-slate-400">Manage public links and access credentials generated in this workspace.</p>
                </div>
              </div>

              {loadingShares ? (
                <div className="flex-1 flex flex-col justify-center items-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <p className="mt-2.5 text-xs text-slate-400 font-medium">Fetching shared links...</p>
                </div>
              ) : sharedLinks.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
                  <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
                    <LinkIcon className="h-5 w-5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-700">No active share links</h3>
                  <p className="mt-1 text-[11px] text-slate-400 max-w-xs">Files or folders you share publicly via link will appear here. You can revoke them at any time.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="px-6 py-3">Resource Name</th>
                          <th className="px-6 py-3">Type</th>
                          <th className="px-6 py-3">Access Role</th>
                          <th className="px-6 py-3">Shared By</th>
                          <th className="px-6 py-3">Created At</th>
                          <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {sharedLinks.map((share) => {
                          const isFolder = !!share.folder;
                          const name = isFolder ? share.folder?.name : share.file?.name;
                          const type = isFolder ? 'Folder' : 'File';
                          const shareUrl = `${window.location.origin}/share/${share.shareToken}`;

                          const copyToClipboard = () => {
                            navigator.clipboard.writeText(shareUrl);
                            alert('Share URL copied to clipboard!');
                          };

                          return (
                            <tr key={share.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-3.5 flex items-center gap-2 max-w-[200px]">
                                {isFolder ? (
                                  <FolderIcon className="h-4.5 w-4.5 text-indigo-500 shrink-0" />
                                ) : (
                                  <FileIcon className="h-4.5 w-4.5 text-slate-450 shrink-0" />
                                )}
                                <span className="font-semibold text-slate-800 truncate">{name || 'Unknown'}</span>
                              </td>
                              <td className="px-6 py-3.5 text-slate-500">{type}</td>
                              <td className="px-6 py-3.5">
                                <span className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-100/50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wide">
                                  {share.accessRole}
                                </span>
                              </td>
                              <td className="px-6 py-3.5 text-slate-500">{share.sharedBy?.name || 'Unknown'}</td>
                              <td className="px-6 py-3.5 text-slate-450">
                                {new Date(share.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-3.5 text-right flex items-center justify-end gap-2">
                                <button
                                  onClick={copyToClipboard}
                                  className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                  <Copy className="h-3 w-3" />
                                  Copy Link
                                </button>
                                <button
                                  onClick={() => handleRevokeShare(share.id)}
                                  className="inline-flex items-center gap-1 rounded bg-red-50 border border-red-100 px-2 py-1 text-[10px] font-bold text-red-650 hover:bg-red-100 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Revoke
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'activity' && (
            <div className="space-y-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Workspace Activity Feed</h2>
                  <p className="text-xs text-slate-400">Audit trail of file uploads, folder creations, and shares in this workspace.</p>
                </div>
              </div>

              {loadingActivity ? (
                <div className="flex-1 flex flex-col justify-center items-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <p className="mt-2.5 text-xs text-slate-400 font-medium">Fetching activity feed...</p>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
                  <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
                    <Activity className="h-5 w-5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-700">No activity yet</h3>
                  <p className="mt-1 text-[11px] text-slate-400 max-w-xs">Actions taken by members in this workspace will be recorded here.</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4 flex-1 overflow-y-auto">
                  <div className="relative border-l border-slate-100 pl-6 ml-3 space-y-6">
                    {activityLogs.map((log: any) => {
                      let actionText = '';
                      let details = null;
                      try {
                        details = log.details ? JSON.parse(log.details) : null;
                      } catch (e) {}

                      switch (log.actionType) {
                        case 'FILE_UPLOAD':
                          actionText = `uploaded file "${details?.name || 'unknown'}"`;
                          break;
                        case 'FILE_DELETE':
                          actionText = `deleted file "${details?.name || 'unknown'}"`;
                          break;
                        case 'FOLDER_CREATE':
                          actionText = `created folder "${details?.name || 'unknown'}"`;
                          break;
                        case 'FOLDER_DELETE':
                          actionText = `deleted folder "${details?.name || 'unknown'}"`;
                          break;
                        case 'SHARE_CREATE':
                          actionText = `created public share link for ${log.targetType.toLowerCase()} "${details?.name || 'unknown'}"`;
                          break;
                        case 'COMMENT_ADD':
                          actionText = `commented on file "${details?.name || 'unknown'}"`;
                          break;
                        default:
                          actionText = `${log.actionType.toLowerCase().replace('_', ' ')} ${log.targetType.toLowerCase()}`;
                      }

                      return (
                        <div key={log.id} className="relative flex items-start gap-3">
                          {/* Timeline dot */}
                          <span className="absolute -left-[30px] top-1 h-3.5 w-3.5 rounded-full border border-indigo-600 bg-white flex items-center justify-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                          </span>

                          <div className="flex-1 text-xs">
                            <p className="text-slate-700">
                              <span className="font-bold text-slate-900">{log.user?.name || 'Someone'}</span>{' '}
                              {actionText}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {new Date(log.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* New Folder Modal Dialog */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-sm font-bold text-slate-900">New Folder</h3>
              <button 
                onClick={() => {
                  setNewFolderName('');
                  setShowFolderModal(false);
                }}
                className="text-slate-400 hover:text-slate-650 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="mt-4 space-y-4">
              <div>
                <label htmlFor="folder-name" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Folder Name
                </label>
                <input
                  id="folder-name"
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewFolderName('');
                    setShowFolderModal(false);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={folderActionLoading}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 cursor-pointer disabled:opacity-50"
                >
                  {folderActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal Dialog */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        fileId={shareFileId}
        folderId={shareFolderId}
        resourceName={shareResourceName}
      />
    </div>
  );
}
