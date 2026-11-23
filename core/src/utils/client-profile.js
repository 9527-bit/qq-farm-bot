const {
    CONFIG,
    DEFAULT_CLIENT_VERSION,
    DEFAULT_WX_CLIENT_VERSION,
} = require('../config/config');

function isWechatPlatform(platform = CONFIG.platform) {
    const normalized = String(platform || '').trim().toLowerCase();
    return normalized === 'wx' || normalized === 'wechat';
}

function getClientVersion(platform = CONFIG.platform) {
    if (isWechatPlatform(platform)) {
        return String(CONFIG.wxClientVersion || '').trim() || DEFAULT_WX_CLIENT_VERSION;
    }
    return String(CONFIG.clientVersion || '').trim() || DEFAULT_CLIENT_VERSION;
}

function setClientVersionForPlatform(version, platform = CONFIG.platform) {
    const next = String(version || '').trim();
    if (!next) return false;
    if (isWechatPlatform(platform)) {
        if (CONFIG.wxClientVersion === next) return false;
        CONFIG.wxClientVersion = next;
        return true;
    }
    if (CONFIG.clientVersion === next) return false;
    CONFIG.clientVersion = next;
    return true;
}

module.exports = {
    isWechatPlatform,
    getClientVersion,
    setClientVersionForPlatform,
};
