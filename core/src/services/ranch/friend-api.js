const { types } = require('../../utils/adoption-proto');
const { sendMsgAsync } = require('../../utils/network');
const { toLong } = require('../../utils/utils');
const extractReplyFriends = reply => reply.friends || [];
async function fetchFriendsByGids(gids, sceneId) {
    const body = types.GetGameFriendsRequest.encode({ gids: gids.map(toLong), global_scene_id: sceneId }).finish();
    const response = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetGameFriends', body);
    return extractReplyFriends(types.GetAllFriendsReply.decode(response.body));
}
async function fetchAllFriendsForScene(sceneId) {
    const body = types.GetAllFriendsRequest.encode({ global_scene_id: sceneId }).finish();
    const response = await sendMsgAsync('gamepb.friendpb.FriendService', 'GetAll', body);
    return types.GetAllFriendsReply.decode(response.body);
}
module.exports = { extractReplyFriends, fetchFriendsByGids, fetchAllFriendsForScene, QQ_FRIEND_LIST_BATCH_SIZE: 35 };
