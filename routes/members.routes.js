// routes/members.routes.js
import {Router} from 'express';
import {asyncHandler} from '../core/asyncHandler.js';

export const membersRoutes = (svc) => {
    const r = Router();

    r.get('/', asyncHandler(async (req, res) => {
        const page = Number(req.query.page ?? 1);
        const lunchOnly = req.query.lunchOnly === 'true' || req.query.lunchOnly === '1';
        const result = svc.list({page, pageSize: 5, lunchOnly});
        res.json({success: true, data: result});
    }));

    r.get('/:id', asyncHandler(async (req, res) => {
        const data = svc.getUserNo(req.params.id);
        if (data) return res.status(404).json({success: false, error: '이 사용자는 이미 등록되었습니다.'});
        res.json({success: true, data});
    }));

    r.post('/', asyncHandler(async (req, res) => {
        const data = await svc.create(req.body);
        res.status(201).json({success: true, data});
    }));

    r.put('/:id', asyncHandler(async (req, res) => {
        const data = svc.update(req.params.id, req.body);
        if (!data) return res.status(404).json({success: false, error: '회원을 찾을 수 없습니다.'});
        res.json({success: true, data});
    }));

    r.delete('/:id', asyncHandler(async (req, res) => {
        const ok = svc.delete(req.params.id);
        if (!ok) return res.status(404).json({success: false, error: '회원을 찾을 수 없습니다.'});
        res.status(204).end();
    }));

    return r;
};
