import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create user, their default workspace and membership transactionally
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: `${name}'s Drive`,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'OWNER',
        },
      });

      return { user, workspace };
    });

    const accessToken = generateAccessToken(result.user.id);
    const refreshToken = generateRefreshToken(result.user.id);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(201).json({
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        avatarUrl: result.user.avatarUrl,
        workspaces: [
          {
            id: result.workspace.id,
            name: result.workspace.name,
            role: 'OWNER',
          },
        ],
      },
      accessToken,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Failed to register user' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ error: 'This email is registered via Google. Please sign in with Google.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        workspaces: user.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role,
        })),
      },
      accessToken,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to log in' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
    });
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Failed to log out' });
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const accessToken = generateAccessToken(user.id);
    // Rotate refresh token optionally
    const newRefreshToken = generateRefreshToken(user.id);
    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        workspaces: user.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role,
        })),
      },
    });
  } catch (error: any) {
    console.error('Refresh token error:', error);
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        workspaces: user.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role,
        })),
      },
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
};

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credential token is required' });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.warn('WARNING: GOOGLE_CLIENT_ID environment variable is not configured.');
    }

    // Verify token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (verifyError: any) {
      console.error('Google token verification failed:', verifyError);
      return res.status(400).json({ error: 'Invalid Google token' });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const { email, name, picture } = payload;

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      // Create user, their default workspace and membership transactionally
      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name: name || 'Google User',
            email,
            passwordHash: null, // Null password for Google OAuth users
            avatarUrl: picture || null,
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            name: `${newUser.name}'s Drive`,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: newUser.id,
            role: 'OWNER',
          },
        });

        return { user: newUser, workspace };
      });

      // Refetch user with memberships
      user = await prisma.user.findUnique({
        where: { id: result.user.id },
        include: {
          memberships: {
            include: {
              workspace: true,
            },
          },
        },
      });
    } else {
      // If user exists and doesn't have an avatar, update it with Google's avatar if available
      if (!user.avatarUrl && picture) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: picture },
          include: {
            memberships: {
              include: {
                workspace: true,
              },
            },
          },
        });
      }
    }

    if (!user) {
      return res.status(500).json({ error: 'Failed to retrieve or create user' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        workspaces: user.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role,
        })),
      },
      accessToken,
    });
  } catch (error: any) {
    console.error('Google login error:', error);
    return res.status(500).json({ error: 'Failed to process Google sign-in' });
  }
};
