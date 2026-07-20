import { create } from 'zustand';
import axios from 'axios';

export interface WorkspaceInfo {
  id: string;
  name: string;
  role: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  workspaces: WorkspaceInfo[];
}

interface AuthState {
  user: UserInfo | null;
  accessToken: string | null;
  loading: boolean;
  setAuth: (user: UserInfo, accessToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  refreshSession: () => Promise<string | null>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  loading: true,

  setAuth: (user, accessToken) => {
    set({ user, accessToken, loading: false });
  },

  clearAuth: () => {
    set({ user: null, accessToken: null, loading: false });
  },

  setLoading: (loading) => {
    set({ loading });
  },

  refreshSession: async () => {
    try {
      const response = await axios.post(
        `${API_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const { accessToken, user } = response.data;
      set({ user, accessToken, loading: false });
      return accessToken;
    } catch (error) {
      set({ user: null, accessToken: null, loading: false });
      return null;
    }
  },
}));
