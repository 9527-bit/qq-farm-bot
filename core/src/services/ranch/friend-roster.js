"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const friendApi = require('./friend-api');
const { CONFIG } = require('../../config/config');
const store = require('../../models/store');
const { getWs, getUserState } = require('../../utils/network');
const { randomDelay, toNum } = require('../../utils/utils');
const { error } = require('./model');

let cache = null;
let sync = null;

function farmStatus(status, statusAtMs) {
    return {
        canSteal: !!status?.can_steal,
        stealLotCount: Number(status?.steal_lot_count) || 0,
        canHelp: !!status?.can_help,
        helpCount: Number(status?.help_count) || 0,
        canMidwife: !!status?.can_midwife,
        midwifeCount: Number(status?.midwife_count) || 0,
        statusAtMs,
    };
}

function assertRanchSession(socket) {
    if (getWs() !== socket || getUserState().globalSceneId !== 2) {
        throw error('RANCH_FRIEND_SESSION_CHANGED', '牧场好友同步期间连接或场景已变化');
    }
}

function getCacheTtlMs() {
    const ttlSec = typeof store.getFriendsListCacheTtlSec === 'function'
        ? Number(store.getFriendsListCacheTtlSec()) : 60;
    return (Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec : 60) * 1000;
}

async function refreshRanchFriendStatus(friends, start) {
    if (!friends.length) return [];
    if (getUserState().globalSceneId !== 2) throw error('RANCH_SCENE_REQUIRED', '刷新好友状态需要先进入牧场场景');
    const socket = getWs();
    const qq = CONFIG.platform === 'qq';
    const size = Math.min(friends.length, friendApi.QQ_FRIEND_LIST_BATCH_SIZE);
    const targets = qq ? Array.from({ length: size }, (_, index) => friends[(start + index) % friends.length]) : friends;
    const byGid = new Map(targets.map(friend => [friend.gid, friend]));
    const rows = qq
        ? await friendApi.fetchFriendsByGids([...byGid.keys()], 2)
        : friendApi.extractReplyFriends(await friendApi.fetchAllFriendsForScene(2));
    assertRanchSession(socket);
    const statusAtMs = Date.now();
    for (const row of rows) {
        const friend = byGid.get(toNum(row.gid));
        if (friend && row.big_farm_status) Object.assign(friend, farmStatus(row.big_farm_status, statusAtMs));
    }
    return [...byGid.keys()];
}

// 调用方持有牧场场景任务。同步分批保留进度，让路后从下一批继续。
async function getRanchFriendList(checkpoint, fresh = false) {
    const state = getUserState();
    if (state.globalSceneId !== 2) throw error('RANCH_SCENE_REQUIRED', '同步好友需要先进入牧场场景');
    const self = toNum(state.gid);
    const socket = getWs();
    const knownGids = typeof store.getKnownFriendGids === 'function' ? store.getKnownFriendGids() : [];
    const gids = CONFIG.platform === 'qq' ? knownGids.filter(gid => gid !== self) : [];
    const key = `${CONFIG.platform}:${self}:${gids.join(',')}`;
    if (!fresh && cache && cache.socket === socket && cache.key === key && Date.now() < cache.expiresAt) {
        return cache.friends;
    }
    if (fresh || !sync || sync.socket !== socket || sync.key !== key) {
        sync = { socket, key, offset: 0, friends: new Map() };
    }
    const current = sync;
    while (current.offset < Math.max(gids.length, 1)) {
        checkpoint?.(false);
        const batch = gids.slice(current.offset, current.offset + friendApi.QQ_FRIEND_LIST_BATCH_SIZE);
        const rows = batch.length
            ? await friendApi.fetchFriendsByGids(batch, 2)
            : friendApi.extractReplyFriends(await friendApi.fetchAllFriendsForScene(2));
        assertRanchSession(socket);
        const requested = new Set(batch);
        const statusAtMs = Date.now();
        for (const friend of rows) {
            const gid = toNum(friend.gid);
            if (gid <= 0 || gid === self || !friend.big_farm_status || (batch.length && !requested.has(gid))) continue;
            current.friends.set(gid, {
                gid,
                name: String(friend.name || '').trim() || String(friend.remark || '').trim() || `GID:${gid}`,
                avatarUrl: String(friend.avatar_url || '').trim(),
                ...farmStatus(friend.big_farm_status, statusAtMs),
            });
        }
        current.offset += Math.max(batch.length, 1);
        checkpoint?.(true);
        if (current.offset < gids.length) await randomDelay(500, 1000);
    }
    const friends = [...current.friends.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.gid - b.gid);
    cache = { socket, key, friends, expiresAt: Date.now() + getCacheTtlMs() };
    sync = null;
    return friends;
}

module.exports = { getRanchFriendList, refreshRanchFriendStatus };
