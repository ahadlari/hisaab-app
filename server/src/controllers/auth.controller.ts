import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { config } from '../config';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !password || (!email && !phone)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name, password, and email or phone are required' } });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' } });
      return;
    }

    // Check existing
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email already registered' } });
        return;
      }
    }
    if (phone) {
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Phone already registered' } });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email: email || null, phone: phone || null, passwordHash },
    });

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });

    res.status(201).json({
      data: {
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, upiId: user.upiId },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, phone, password } = req.body;

    if (!password || (!email && !phone)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password and email or phone are required' } });
      return;
    }

    const user = email
      ? await prisma.user.findUnique({ where: { email } })
      : await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      return;
    }

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });

    res.status(200).json({
      data: {
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, upiId: user.upiId },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, phone: true, upiId: true },
    });

    if (!user) {
      res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { upiId } = req.body;
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: { upiId },
    });

    res.json({
      data: {
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, upiId: user.upiId },
      },
    });
  } catch (error) {
    next(error);
  }
}
