function registerAdminAdoptionRoutes({ app, provider, store, getAccountIdFromRequest, canAccessAccount, sendProviderError }) {
    const resolvedStore = store || require('../models/store');
    const route = (verb, path, run) => app[verb](path, async (req, res) => {
        const accountId = getAccountIdFromRequest(req);
        if (!accountId) return res.status(400).json({ ok: false, error: '缺少账号标识' });
        if (!canAccessAccount(req, accountId)) return res.status(403).json({ ok: false, error: '无权访问此账号' });
        try {
            const data = await run(accountId, req);
            if (!res.headersSent && !res.locals?.requestTimedOut) res.json({ ok: true, data });
        } catch (error) { sendProviderError(res, error); }
    });
    route('get', '/api/ranch/options', () => require('../config/ranch-automation').RANCH_ANIMAL_OPTIONS);
    route('get', '/api/ranch/friend-blacklist', id => ({
        blacklist: resolvedStore.getRanchFriendBlacklist ? resolvedStore.getRanchFriendBlacklist(id) : [],
    }));
    route('post', '/api/ranch/friend-blacklist/toggle', (id, req) => {
        const result = resolvedStore.toggleRanchFriendBlacklist(id, req.body?.gid);
        if (provider && typeof provider.broadcastConfig === 'function') {
            provider.broadcastConfig(id);
        }
        return result;
    });
    route('get', '/api/ranch', (id, req) => provider.getRanchState(id, req.query.view || 'animals', req.query.shopId, req.query.hostGid));
    route('post', '/api/ranch/:action/quote', (id, req) => provider.prepareRanchAction(id, req.params.action, req.body || {}));
    route('post', '/api/ranch/:action', (id, req) => provider.operateRanch(id, req.params.action, req.body || {}));
    route('get', '/api/activities/muge', id => provider.getMugeActivity(id));
    route('post', '/api/activities/muge/:action', (id, req) => provider.operateMugeActivity(id, req.params.action, { answers: req.body?.answers, clear: req.body?.clear }));
    route('get', '/api/activities/muge/window', () => require('../models/adoption-activity-window').readWindow());
}
module.exports = { registerAdminAdoptionRoutes };
