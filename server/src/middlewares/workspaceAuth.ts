import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';

export const requireWorkspaceMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || (req.body.workspaceId as string);
    const userId = req.user?.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    next();
  } catch (error) {
    console.error('Workspace membership validation error:', error);
    return res.status(500).json({ error: 'Internal validation error' });
  }
};

export const requireWorkspaceWriter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || (req.body.workspaceId as string);
    const userId = req.user?.id;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    if (membership.role !== 'OWNER' && membership.role !== 'EDITOR') {
      return res.status(403).json({ error: 'You do not have write permissions in this workspace' });
    }

    next();
  } catch (error) {
    console.error('Workspace write validation error:', error);
    return res.status(500).json({ error: 'Internal validation error' });
  }
};
