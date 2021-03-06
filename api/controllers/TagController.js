/* global ElasticsearchService, ItemXTag, Tag, TokenService, User, UserXTag */

/**
 * TagController
 *
 * @description :: Server-side logic for managing tags related to listings or users
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    find: find,
    findOne: findOne,
    create: create,
    update: update,
    destroy: destroy

};

function find(req, res) {
    var access = "others";
    // TODO manage array of Ids
    // var itemCategoryId = req.param("itemCategoryId");

    var findAttrs = {};

    // if (itemCategoryId) {
    //     findAttrs.itemCategoryId = itemCategoryId;
    // }

    return Tag
        .find(findAttrs)
        .sort({ nameURLSafe: 1 })
        .then(tags => {
            res.json(Tag.exposeAll(tags, access));
        })
        .catch(res.sendError);
}

function findOne(req, res) {
    return res.forbidden();
}

function create(req, res) {
    var filteredAttrs = [
        "name",
        "itemCategoryIds"
    ];
    var createAttrs = _.pick(req.allParams(), filteredAttrs);
    var access = "others";

    if (! createAttrs.name) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Tag.findOne({ name: createAttrs.name });
        })
        .then(tag => {
            if (! tag) {
                return Tag.create(createAttrs);
            } else {
                return tag;
            }
        })
        .then(tag => {
            res.json(Tag.expose(tag, access));
        })
        .catch(res.sendError);
}

function update(req, res) {
    return res.forbidden();
}

function destroy(req, res) {
    var isAdmin = TokenService.isRole(req, "admin");
    var tagId   = parseInt(req.param("id"), 10);
    var tagUsersIds;
    var tagUsers;

    if (! isAdmin) {
        return res.forbidden();
    } else if (! tagId) {
        return res.badRequest();
    }

    return Promise.coroutine(function* () {
        var tag = yield Tag.findOne({
            id: tagId
        });

        if (! tag) {
            return res.notFound();
        }

        var tagUse = yield Promise.props({
            userTags: UserXTag.find({ tagId: tagId }),
            itemTags: ItemXTag.find({ tagId: tagId })
        });

        tagUsersIds  = _.pluck(tagUse.userTags, "userId");
        tagUsers     = yield User.find({ id: tagUsersIds });
        var updates  = [];

        _.forEach(tagUsers, function (user) {
            if (! _.includes(user.tagsIds, tagId)) {
                return; // sanity check
            }
            var updatedTagsIds = _.reject(user.tagsIds, id => id === tagId);

            updates.push(User.updateOne(user.id, { tagsIds: updatedTagsIds }));
        });

        yield Promise.all(updates);

        yield Promise.all([
            Tag.destroy({ id: tagId }),
            UserXTag.destroy({ tagId: tagId }),
            ItemXTag.destroy({ tagId: tagId })
        ]);

        var itemsIds = _.pluck(tagUse.itemTags, "itemId");
        ElasticsearchService.shouldSyncItems(itemsIds);

        return res.json({
            nbUsers: tagUse.userTags.length,
            nbItems: tagUse.itemTags.length
        });
    })()
    .catch(res.sendError);
}
